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
import { installInputTrace, type InputTraceReport } from "../tests/voiceover/input-trace";

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
const requestedReadback = process.argv.includes("--readback");
const largeArray = process.argv.includes("--large-array");
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
const report: {
  appAsarSha256: string;
  speechMode: string;
  largeArrayItems: number;
  status: string;
  steps: unknown[];
  error?: string;
} = {
  appAsarSha256: digest,
  speechMode: requestedReadback ? "requested-readback" : "automatic-announcements",
  largeArrayItems: largeArray ? 100000 : 0,
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
let inputTrace: Awaited<ReturnType<typeof installInputTrace>> | undefined;
try {
  await client.connect();
  connected = true;
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(
    `CREATE TABLE "${schema}".records(id int PRIMARY KEY, note text, doc json); INSERT INTO "${schema}".records VALUES(1,'original','{"name":"Rowberry","items":[{"name":"Apple"},{"name":"Berry"}]}')`,
  );
  if (largeArray)
    await client.query(
      `INSERT INTO "${schema}".records SELECT 2, 'large array', json_build_object('items', json_agg(n ORDER BY n)) FROM generate_series(0, 99999) AS n`,
    );
  app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
    timeout: 15000,
  });
  const running = app;
  const page = await app.firstWindow();
  async function nativeKey(code: number, voiceOverModifier = false) {
    await appleScript(`tell application "System Events"
      if (unix id of first application process whose frontmost is true) is not ${running.process().pid} then error "Test app lost foreground focus"
      key code ${code}${voiceOverModifier ? " using {control down, option down}" : ""}
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
  const panel = page.getByRole("region", { name: "JSON inspector", exact: true });
  const tree = panel.getByRole("tree", { name: "JSON tree", exact: true });
  const items = panel.getByRole("treeitem", { name: "items: array, 2 items", exact: true });
  inputTrace = await installInputTrace(running, page);
  async function step(
    name: string,
    action: () => Promise<void>,
    expected: string[],
    forbidden: string[] = [],
    verify?: () => Promise<void>,
  ) {
    await inputTrace?.start();
    let input: InputTraceReport | undefined;
    try {
      const result = await captureSpeech({
        read: () => appleScript('tell application "VoiceOver" to get content of last phrase'),
        action,
        focused,
        expected,
        forbidden,
        verify,
      });
      input = await inputTrace?.stop();
      await page.screenshot({ path: path.join(evidence, `${name}.png`) });
      report.steps.push({ name, status: "passed", ...result, input });
      console.log(`PASS ${name}: ${result.phrase}`);
    } catch (error) {
      input ??= await inputTrace?.stop();
      report.steps.push({ name, status: "failed", error: String(error), input });
      await page.screenshot({ path: path.join(evidence, `${name}-failed.png`) }).catch(() => {});
      throw error;
    }
  }
  if (process.argv.includes("--table-controls")) {
    const sort = grid.getByRole("button", { name: /^Sort by id(?:,|$)/ });
    await page.getByRole("button", { name: "Add filter", exact: true }).focus();
    await step(
      "add-filter",
      () => nativeKey(36),
      ["Filter column 2"],
      [],
      async () => {
        await expect(page.getByLabel("Filter column 2", { exact: true })).toBeFocused();
      },
    );
    await sort.focus();
    for (const direction of ["ascending", "descending"]) {
      await step(
        `sort-${direction}`,
        () => nativeKey(36),
        [direction],
        [],
        async () => {
          await expect(sort).toBeFocused();
          await expect(grid.locator(`[aria-sort="${direction}"]`)).toContainText("id");
        },
      );
    }
  }
  await grid.getByRole("gridcell").nth(2).dblclick();
  const verifyItems = async (expanded: boolean) => {
    await expect(items).toHaveAttribute("aria-selected", "true");
    await expect(items).toHaveAttribute("aria-expanded", String(expanded));
    await expect(tree).toBeFocused();
  };
  await step(
    "select-items",
    () => items.click(),
    ["items", "collapsed"],
    ["items items"],
    () => verifyItems(false),
  );
  await appleScript('tell application "VoiceOver" to tell vo cursor to move into item');
  async function changeExpansion(code: number, expanded: boolean) {
    await nativeKey(code);
    await expect(items).toHaveAttribute("aria-expanded", String(expanded));
    // VO-F3 describes the actual current item; never supply expected speech.
    // This opt-in mode does not qualify automatic state-change announcements.
    if (requestedReadback) await nativeKey(99, true);
  }
  await step(
    "expand-items",
    () => changeExpansion(124, true),
    ["items", "expanded"],
    ["items items"],
    () => verifyItems(true),
  );
  await step(
    "collapse-items",
    () => changeExpansion(123, false),
    ["items", "collapsed"],
    [],
    () => verifyItems(false),
  );
  await step(
    "select-name",
    () => panel.getByRole("treeitem", { name: "name: Rowberry", exact: true }).click(),
    ["name", "rowberry"],
    ["expand name", "name name"],
    async () => {
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveAccessibleName(
        "name: Rowberry",
      );
      await expect(tree).toBeFocused();
    },
  );
  await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
  if (largeArray) {
    await grid.getByRole("gridcell").nth(5).dblclick();
    const array = panel.getByRole("treeitem", { name: "items: array, 100000 items", exact: true });
    const selected = panel.getByRole("treeitem", { selected: true });
    const verifyArray = async (expanded: boolean) => {
      await expect(array).toHaveAttribute("aria-selected", "true");
      await expect(array).toHaveAttribute("aria-expanded", String(expanded));
      await expect(tree).toBeFocused();
    };
    await step(
      "large-select-items",
      () => array.click(),
      ["items", "collapsed"],
      [],
      () => verifyArray(false),
    );
    await appleScript('tell application "VoiceOver" to tell vo cursor to move into item');
    await step(
      "large-expand-items",
      async () => {
        await nativeKey(124);
        await expect(array).toHaveAttribute("aria-expanded", "true");
        if (requestedReadback) await nativeKey(99, true);
      },
      ["items", "expanded"],
      [],
      () => verifyArray(true),
    );
    const assertPosition = async (position: number) => {
      await expect(selected).toHaveAccessibleName(`${position - 1}: ${position - 1}`);
      await expect(selected).toHaveAttribute("aria-posinset", String(position));
      await expect(selected).toHaveAttribute("aria-setsize", "100000");
      expect(await panel.getByRole("treeitem").count()).toBeLessThan(40);
      await expect(tree).toBeFocused();
    };
    await step(
      "large-first-position",
      () => nativeKey(124),
      ["1 of 100000"],
      [],
      () => assertPosition(1),
    );
    await step(
      "large-last-position",
      () => nativeKey(119),
      ["99999", "100000 of 100000"],
      [],
      () => assertPosition(100000),
    );
    await tree.evaluate((element) => element.scrollTo({ top: 0 }));
    await expect(tree).toHaveAttribute(
      "aria-activedescendant",
      (await selected.getAttribute("id")) as string,
    );
    await expect(selected).toHaveCount(1);
    await step(
      "large-offscreen-navigation",
      () => nativeKey(126),
      ["99998", "99999 of 100000"],
      [],
      () => assertPosition(99999),
    );
    await step(
      "large-home",
      () => nativeKey(115),
      ["json root"],
      [],
      async () => {
        await expect(selected).toHaveAccessibleName("JSON root: object, 1 keys");
        await expect(tree).toBeFocused();
      },
    );
    await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
  }
  await grid.getByRole("gridcell").nth(1).click();
  await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
  await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill("voiceover draft only");
  await page.getByRole("button", { name: "Stage cell", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Confirm database changes" });
  await step(
    "open-preview",
    () => page.getByRole("button", { name: "Preview changes", exact: true }).click(),
    ["cancel preview"],
    [],
    async () => {
      await expect(
        preview.getByRole("button", { name: "Cancel preview", exact: true }),
      ).toBeFocused();
    },
  );
  await step(
    "cancel-preview-passed-through",
    async () => {
      // VoiceOver consumes Escape itself unless the next key is passed to the app.
      await nativeKey(48, true);
      await nativeKey(53);
    },
    ["preview changes"],
    [],
    async () => {
      await expect(preview).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Preview changes", exact: true }),
      ).toBeFocused();
    },
  );
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
  await inputTrace?.dispose();
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
