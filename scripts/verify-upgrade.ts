import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
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
const directory = await fs.mkdtemp(path.join(tmpdir(), "rowberry-upgrade-"));
const profile = {
  id: randomUUID(),
  name: "Upgrade fixture",
  host: "localhost",
  port: 1,
  database: "upgrade_fixture",
  user: "upgrade_fixture",
  tls: { kind: "verify-full" },
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
const secret = randomUUID();
let application: ElectronApplication | undefined;
let page!: Page;
let completed = false;
async function request(input: Record<string, unknown>) {
  const command = CommandSchema.parse({ ...input, requestId: randomUUID() });
  const reply = await page.evaluate((command) => window.dbapp.request(command), command);
  if (!reply.ok) throw new Error(`${command.kind}: ${reply.error.message}`);
  return reply;
}
async function launch(build: typeof baseline) {
  application = await electron.launch({
    executablePath: build.executable,
    args: [`--user-data-dir=${directory}`],
    timeout: 30000,
  });
  page = await application.firstWindow();
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  await expect(page.locator("[data-app-ready]")).toBeVisible();
  // Freeze the renderer's debounced layout save while seeding/reading durable state.
  await page.clock.install();
  await page.clock.runFor(350);
}
async function close() {
  if (!application) return;
  // Accept the native unsaved-work close guard; recovery remains on disk.
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await application.close();
  application = undefined;
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
    if (nativeVault) expect(await credential()).toBe(true);
    console.log(
      `PASS ${phase}: connection, saved query, SQL draft and exact recovered JSON${nativeVault ? ", native credential" : " (native credential not tested)"}`,
    );
    await close();
  }
  completed = true;
} finally {
  // Remove only this run's random credential, even when candidate validation fails.
  try {
    if (nativeVault) {
      await close();
      await launch(baseline);
      expect(await credential(true)).toBe(true);
    }
  } finally {
    await close();
    if (completed) await fs.rm(directory, { recursive: true, force: true });
    else console.error(`Failed upgrade profile retained for diagnosis: ${directory}`);
  }
}
console.log(
  JSON.stringify(
    { baseline, candidate, nativeVault, platform: process.platform, architecture: process.arch },
    null,
    2,
  ),
);
console.log(
  "PASS packaged profile upgrade; installer replacement, signing and database connectivity are not covered.",
);
