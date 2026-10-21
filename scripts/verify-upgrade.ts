import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { z } from "zod";
import { CommandSchema } from "../src/shared/protocol";

const [baselinePath, candidatePath, ...flags] = process.argv.slice(2);
if (!baselinePath || !candidatePath || flags.some((flag) => flag !== "--native-vault"))
  throw new Error(
    "Usage: bun run verify:upgrade <baseline package> <candidate package> [--native-vault]",
  );
const nativeVault = flags.includes("--native-vault");
async function describe(directory: string) {
  const root = await fs.realpath(directory);
  const executable = path.join(
    root,
    process.platform === "darwin"
      ? "Contents/MacOS/Rowberry"
      : process.platform === "win32"
        ? "Rowberry.exe"
        : "rowberry",
  );
  await fs.access(executable);
  const archive = path.join(
    root,
    process.platform === "darwin" ? "Contents/Resources/app.asar" : "resources/app.asar",
  );
  const sha256 = createHash("sha256")
    .update(await fs.readFile(archive))
    .digest("hex");
  return { root, executable, sha256 };
}
const baseline = await describe(baselinePath);
const candidate = await describe(candidatePath);
if (baseline.sha256 === candidate.sha256)
  throw new Error("Baseline and candidate archives must differ");
let caPath: string | undefined;
if (nativeVault) {
  const manifest = process.env.DBAPP_POSTGRES_FIXTURES;
  if (!manifest)
    throw new Error(
      "--native-vault requires DBAPP_POSTGRES_FIXTURES with a running PostgreSQL 18 fixture",
    );
  const fixture = z
    .object({ directory: z.string(), containers: z.array(z.string()) })
    .parse(JSON.parse(await fs.readFile(manifest, "utf8")));
  if (!fixture.containers.some((name) => /^dbapp-task3-pg18-/.test(name)))
    throw new Error("PostgreSQL 18 fixture missing");
  caPath = path.join(fixture.directory, "ca.crt");
  await fs.access(caPath);
}
const directory = await fs.mkdtemp(path.join(tmpdir(), "rowberry-upgrade-"));
const profile = {
  id: randomUUID(),
  name: "Upgrade fixture",
  host: "localhost",
  port: nativeVault ? 55418 : 1,
  database: nativeVault ? "fixture" : "upgrade_fixture",
  user: nativeVault ? "fixture" : "upgrade_fixture",
  tls: { kind: "verify-full", ...(caPath ? { caPath } : {}) },
  environmentColor: "#3985d6",
};
const query = {
  id: randomUUID(),
  name: "Upgrade saved query",
  sql: "SELECT 'upgrade 🫐' AS preserved",
};
const workspace = {
  version: 1,
  recoveryEnabled: true,
  theme: "dark",
  layout: { sqlOpened: false, showSql: false },
  sql: ["SELECT 'unsaved SQL'"],
  drafts: [{ id: "upgrade-json", kind: "json", label: "Upgrade JSON copy", text: '{"invalid 🫐' }],
};
const secret = "fixture-only-password";
let application: ElectronApplication | undefined;
let page!: Page;
let completed = false;
async function request(input: Record<string, unknown>) {
  const command = CommandSchema.parse({ ...input, requestId: randomUUID() });
  const reply = await page.evaluate((command) => window.dbapp.request(command), command);
  if (!reply.ok) throw new Error(`${command.kind}: ${reply.error.message}`);
  return reply;
}
async function launch(build: typeof baseline, userData = directory) {
  application = await electron.launch({
    executablePath: build.executable,
    args: [`--user-data-dir=${userData}`],
    timeout: 30000,
  });
  page = await application.firstWindow();
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  await expect(page.locator("[data-app-ready]")).toBeVisible();
  // Freeze the renderer's debounced layout save while seeding/reading durable state.
  await page.clock.install();
  await page.clock.runFor(350);
}
const shutdownErrors: unknown[] = [];
async function close() {
  const current = application;
  application = undefined;
  if (!current) return;
  const child = current.process();
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  try {
    if (!exited()) {
      // Accept the native unsaved-work close guard; recovery remains on disk.
      await current.evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      });
    }
    await current.close();
  } catch (error) {
    // An already-exited candidate cannot accept IPC. Still run independent cleanup.
    if (!exited()) {
      shutdownErrors.push(error);
      const stopped = once(child, "exit", { signal: AbortSignal.timeout(5000) });
      child.kill();
      await stopped.catch((failure) => shutdownErrors.push(failure));
    }
  }
}
async function credential(remove = false) {
  if (!application) throw new Error("No running package");
  return application.evaluate(
    async ({ app }, { id, secret, remove }) => {
      const require = process
        .getBuiltinModule("node:module")
        .createRequire(`${app.getAppPath()}/package.json`);
      const entry = new (require("@napi-rs/keyring").AsyncEntry)(
        "org.dbapp.desktop.connections",
        id,
        { linux: { store: "secret-service" } },
      );
      if (remove) await entry.deletePassword();
      return (await entry.getPassword()) === (remove ? null : secret);
    },
    { id: profile.id, secret, remove },
  );
}
try {
  await launch(baseline);
  await request({ kind: "connections.save", profile });
  if (nativeVault) {
    const reply = await request({
      kind: "connections.submitSecret",
      id: profile.id,
      secret,
      persist: true,
    });
    expect(reply).toMatchObject({ data: { storage: "secure" } });
    expect(await credential()).toBe(true);
  }
  await request({ kind: "queries.saved.save", ...query });
  await request({ kind: "workspace.save", state: workspace });
  await close();
  for (const phase of ["upgrade", "candidate restart"]) {
    await launch(candidate);
    expect(await request({ kind: "connections.list", offset: 0 })).toMatchObject({
      data: { profiles: [profile] },
    });
    expect(await request({ kind: "queries.saved.get", id: query.id })).toMatchObject({
      data: query,
    });
    expect(await request({ kind: "workspace.load" })).toMatchObject({ data: workspace });
    await expect(page.getByLabel("Recovered json draft")).toHaveValue(workspace.drafts[0]!.text);
    await expect(page.getByText("No connection", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run SQL / selection" })).toHaveCount(0);
    if (nativeVault) {
      // No secret submission in the candidate: authenticate through its real lookup path.
      const connected = await request({ kind: "connections.connect", id: profile.id });
      if (connected.kind !== "connections.connect") throw new Error("Unexpected connect reply");
      await request({ kind: "sessions.close", sessionId: connected.data.sessionId });
    }
    console.log(
      `PASS ${phase}: connection, saved query, SQL draft and exact recovered JSON${nativeVault ? ", authenticated native credential" : " (native credential not tested)"}`,
    );
    await close();
  }
  completed = true;
} finally {
  // The baseline must never open a profile migrated by the candidate.
  let cleanupComplete = false;
  let cleanupDirectory: string | undefined;
  try {
    await close();
    if (nativeVault) {
      cleanupDirectory = await fs.mkdtemp(path.join(tmpdir(), "rowberry-upgrade-cleanup-"));
      await launch(baseline, cleanupDirectory);
      expect(await credential(true)).toBe(true);
    }
    cleanupComplete = true;
  } finally {
    await close();
    if (cleanupDirectory) await fs.rm(cleanupDirectory, { recursive: true, force: true });
    if (completed && cleanupComplete && shutdownErrors.length === 0)
      await fs.rm(directory, { recursive: true, force: true });
    else console.error(`Failed upgrade profile retained for diagnosis: ${directory}`);
  }
}
if (shutdownErrors.length) throw new AggregateError(shutdownErrors, "Package shutdown failed");
console.log(
  JSON.stringify(
    { baseline, candidate, nativeVault, platform: process.platform, architecture: process.arch },
    null,
    2,
  ),
);
console.log("PASS packaged profile upgrade; installer replacement and signing are not covered.");
