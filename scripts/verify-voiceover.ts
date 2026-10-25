import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { _electron as electron, expect } from "@playwright/test";
import { Client } from "pg";
import { ReplySchema } from "../src/shared/protocol";
import { captureSpeech } from "../tests/voiceover/speech";

const exec = promisify(execFile);
async function appleScript(script: string) {
  const { stdout } = await exec("/usr/bin/osascript", ["-e", script], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  return stdout.trim();
}
async function preflight() {
  if (process.platform !== "darwin")
    throw new Error("Native VoiceOver qualification requires macOS");
  if ((await appleScript('application "VoiceOver" is running')) !== "true")
    throw new Error(
      "Turn VoiceOver on first; the harness does not change your accessibility settings",
    );
  // Check permission without saving speech from whatever app currently has focus.
  await appleScript('tell application "VoiceOver" to get content of last phrase');
}
await preflight();
if (process.argv.includes("--check")) {
  console.log("VoiceOver is running and its speech scripting interface is available");
  process.exit(0);
}
if (process.env.DBAPP_VOICEOVER !== "1")
  throw new Error("Set DBAPP_VOICEOVER=1 for a foreground native run");
const executable = path.resolve(
  process.env.DBAPP_PACKAGE_EXECUTABLE ?? "release/mac-arm64/Rowberry.app/Contents/MacOS/Rowberry",
);
const archive = path.resolve(path.dirname(executable), "../Resources/app.asar");
const digest = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
const directory = await mkdtemp(path.join(tmpdir(), "rowberry-voiceover-"));
const evidence = path.join(directory, "evidence");
const profile = path.join(directory, "profile");
await mkdir(evidence);
const report: { appAsarSha256: string; status: string; steps: unknown[]; error?: string } = {
  appAsarSha256: digest,
  status: "running",
  steps: [],
};
const client = new Client({
  host: "127.0.0.1",
  port: 55418,
  database: "fixture",
  user: "fixture",
  password: "fixture-only-password",
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
  query_timeout: 8000,
});
const schema = `voiceover_${crypto.randomUUID().replaceAll("-", "")}`;
let connected = false;
let created = false;
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  await client.connect();
  connected = true;
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(
    `CREATE TABLE "${schema}".records(id int PRIMARY KEY, note text, doc json); INSERT INTO "${schema}".records VALUES(1,'original','{"name":"Rowberry","items":[{"name":"Apple"},{"name":"Berry"}]}')`,
  );
  app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
    timeout: 15000,
  });
  const running = app;
  const page = await app.firstWindow();
  async function nativeKey(code: number) {
    await appleScript(`tell application "System Events"
      if (unix id of first application process whose frontmost is true) is not ${running.process().pid} then error "Test app lost foreground focus"
      key code ${code}
    end tell`);
  }

  page.setDefaultTimeout(10000);
  const focused = () =>
    running.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.isFocused()),
    );
  async function request(command: Record<string, unknown>) {
    const reply = ReplySchema.parse(
      await page.evaluate(
        (command) =>
          Reflect.apply(window.dbapp.request, window.dbapp, [
            { ...command, requestId: crypto.randomUUID() },
          ]),
        command,
      ),
    );
    if (!reply.ok) throw new Error(`Fixture setup failed: ${command.kind}`);
  }
  const id = crypto.randomUUID();
  await request({
    kind: "connections.save",
    profile: {
      id,
      name: "VoiceOver fixture",
      host: "127.0.0.1",
      port: 55418,
      user: "fixture",
      database: "fixture",
      tls: { kind: "disable", acknowledged: true },
      environmentColor: "#123456",
    },
  });
  await request({
    kind: "connections.submitSecret",
    id,
    secret: "fixture-only-password",
    persist: false,
  });
  await page.reload();
  await page.getByRole("button", { name: "Connect VoiceOver fixture", exact: true }).click();
  await page.getByRole("textbox", { name: "Search schemas and tables" }).fill(schema);
  await page.getByRole("button", { name: `records ${schema} · table`, exact: true }).click();
  const grid = page.getByRole("grid", { name: "Table rows" });
  await grid.getByRole("gridcell").nth(2).dblclick();
  const panel = page.getByRole("region", { name: "JSON inspector", exact: true });
  const items = panel.getByRole("treeitem", { name: "items: array, 2 items", exact: true });
  async function step(
    name: string,
    action: () => Promise<void>,
    expected: string[],
    forbidden: string[] = [],
  ) {
    try {
      const result = await captureSpeech({
        read: () => appleScript('tell application "VoiceOver" to get content of last phrase'),
        action,
        focused,
        expected,
        forbidden,
      });
      report.steps.push({ name, status: "passed", ...result });
      await page.screenshot({ path: path.join(evidence, `${name}.png`) });
      console.log(`PASS ${name}: ${result.phrase}`);
    } catch (error) {
      report.steps.push({ name, status: "failed", error: String(error) });
      await page.screenshot({ path: path.join(evidence, `${name}-failed.png`) }).catch(() => {});
      throw error;
    }
  }
  await step("select-items", () => items.click(), ["items", "collapsed"], ["items items"]);
  await step("expand-items", () => nativeKey(124), ["items", "expanded"], ["items items"]);
  await step("collapse-items", () => nativeKey(123), ["items", "collapsed"]);
  await step(
    "select-name",
    () => panel.getByRole("treeitem", { name: "name: Rowberry", exact: true }).click(),
    ["name", "rowberry"],
    ["expand name", "name name"],
  );
  await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
  await grid.getByRole("gridcell").nth(1).click();
  await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
  await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill("voiceover draft only");
  await page.getByRole("button", { name: "Stage cell", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Confirm database changes" });
  await step(
    "open-preview",
    () => page.getByRole("button", { name: "Preview changes", exact: true }).click(),
    ["cancel preview"],
  );
  await expect(preview.getByRole("button", { name: "Cancel preview", exact: true })).toBeFocused();
  await step("cancel-preview", () => nativeKey(53), ["preview changes"]);
  await expect(preview).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Preview changes", exact: true })).toBeFocused();
  if (
    (await client.query(`SELECT note FROM "${schema}".records WHERE id=1`)).rows[0].note !==
    "original"
  )
    throw new Error("Cancellation changed fixture data");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  process.exitCode = 1;
} finally {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      )
      .catch(() => {});
    await app.close().catch(() => {});
  }
  if (created)
    await client.query(`DROP SCHEMA "${schema}" CASCADE`).catch((error) => {
      report.error = `Cleanup failed: ${error}`;
      report.status = "failed";
      process.exitCode = 1;
    });
  if (connected) await client.end();
  await rm(profile, { recursive: true, force: true });
  await writeFile(path.join(evidence, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(`Evidence: ${evidence}`);
}
