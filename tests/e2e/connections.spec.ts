import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
let application: ElectronApplication;
let directory: string;
async function launch() {
  application = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
  });
  return application.firstWindow();
}
test.beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "dbapp-connections-"));
});
test.afterEach(async () => {
  await application?.close();
  rmSync(directory, { recursive: true, force: true });
});
test("save, restart, edit and delete connection metadata through the desktop UI", async () => {
  let page = await launch();
  await page.getByRole("button", { name: "New connection", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Development");
  await expect(page.getByLabel("TLS", { exact: true })).toHaveValue("verify-full");
  await page.getByLabel("TLS", { exact: true }).selectOption("disable");
  await expect(page.getByText("Traffic, including your password")).toBeVisible();
  await page.getByLabel("I understand this connection's risk").check();
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Development", exact: true })).toBeVisible();
  await application.close();
  page = await launch();
  await page.getByRole("button", { name: "Edit Development", exact: true }).click();
  await expect(page.getByLabel("TLS", { exact: true })).toHaveValue("disable");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Name", { exact: true }).fill("Renamed");
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await page.getByRole("button", { name: "Delete Renamed", exact: true }).click();
  await page.getByRole("button", { name: "Delete connection", exact: true }).click();
  await expect(page.getByText("No saved connections")).toBeVisible();
  await application.close();
  page = await launch();
  await expect(page.getByText("No saved connections")).toBeVisible();
});
test("unavailable native store clears password input immediately and persists no secret", async () => {
  const page = await launch();
  const sentinel = "E2E_SENTINEL_SECRET_8291";
  const logs: string[] = [];
  application.process().stdout?.on("data", (chunk) => logs.push(String(chunk)));
  application.process().stderr?.on("data", (chunk) => logs.push(String(chunk)));
  // Force native API failure in main, without adding a production security bypass.
  await application.evaluate(({ app }, sentinel) => {
    const nativeRequire = process
      .getBuiltinModule("node:module")
      .createRequire(`${app.getAppPath()}/package.json`);
    const { AsyncEntry } = nativeRequire("@napi-rs/keyring");
    AsyncEntry.prototype.setPassword = async () => {
      throw new Error(sentinel);
    };
  }, sentinel);
  // Expire the five-second native capability cache before probing the locked store.
  await new Promise((resolve) => setTimeout(resolve, 5100));
  // Refresh the list to observe the failed native probe.
  await page.reload();
  await page.getByRole("button", { name: "New connection", exact: true }).click();
  await expect(
    page.getByText("OS credential storage is unavailable.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Session");
  await page.getByLabel("Password", { exact: true }).fill(sentinel);
  const cleared = await page.evaluate(() => {
    const input = document.querySelector('input[type="password"]');
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent === "Save connection",
    );
    if (!(input instanceof HTMLInputElement) || !button) return false;
    button.click();
    return input.value === "";
  });
  expect(cleared).toBe(true);
  await expect(page.getByText("Password is session-only", { exact: false })).toBeVisible();
  const reply = await page.evaluate(async () =>
    Reflect.apply(window.dbapp.request, window.dbapp, [
      { kind: "connections.list", requestId: "secret-check", offset: 0 },
    ]),
  );
  expect(JSON.stringify(reply)).not.toContain(sentinel);
  expect(
    readFileSync(path.join(directory, "profiles.sqlite")).includes(Buffer.from(sentinel)),
  ).toBe(false);
  await application.close();
  expect(logs.join("")).not.toContain(sentinel);
  const restarted = await launch();
  await restarted.getByRole("button", { name: "Edit Session", exact: true }).click();
  await expect(restarted.getByLabel("Password", { exact: true })).toHaveValue("");
  await restarted.getByRole("button", { name: "Cancel", exact: true }).click();
  await restarted.getByRole("button", { name: "Delete Session", exact: true }).click();
  await restarted.getByRole("button", { name: "Delete connection", exact: true }).click();
  await expect(restarted.getByText("No saved connections")).toBeVisible();
});

test("packaged native OS vault survives entry recreation", async () => {
  test.skip(
    !process.env.DBAPP_PACKAGE_EXECUTABLE || process.env.DBAPP_NATIVE_CREDENTIAL_TEST !== "1",
    "Explicit native credential-store qualification only",
  );
  await launch();
  const result = await application.evaluate(async ({ app }) => {
    if (!app.isPackaged) throw new Error("Expected production executable");
    const require = process
      .getBuiltinModule("node:module")
      .createRequire(`${app.getAppPath()}/package.json`);
    const { AsyncEntry } = require("@napi-rs/keyring");
    const id = crypto.randomUUID();
    const secret = crypto.randomUUID();
    const entry = new AsyncEntry("org.dbapp.desktop.package-test", id, {
      linux: { store: "secret-service" },
    });
    try {
      await entry.setPassword(secret);
      const reopened = new AsyncEntry("org.dbapp.desktop.package-test", id, {
        linux: { store: "secret-service" },
      });
      return (await reopened.getPassword()) === secret;
    } finally {
      await entry.deletePassword();
    }
  });
  expect(result).toBe(true);
});
