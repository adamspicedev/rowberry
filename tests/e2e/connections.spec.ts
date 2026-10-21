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
  await page.getByText("SSL settings", { exact: false }).click();
  await expect(page.getByLabel("TLS", { exact: true })).toHaveValue("verify-full");
  await page.getByLabel("TLS", { exact: true }).selectOption("disable");
  await expect(page.getByText("Traffic, including your password")).toBeVisible();
  await page.getByLabel("I understand this connection's risk").check();
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Select Development", exact: true })).toBeVisible();
  await application.close();
  page = await launch();
  await page.getByRole("button", { name: "Select Development", exact: true }).click();
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
  await restarted.getByRole("button", { name: "Select Session", exact: true }).click();
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

test("connection manager filters addresses, protects drafts and keeps passwords private", async () => {
  const page = await launch();
  await page.evaluate(async () => {
    for (const profile of [
      {
        name: "Local playground",
        host: "localhost",
        database: "rowberry",
        environmentColor: "#7c3aed",
      },
      {
        name: "Development",
        host: "dev.example.test",
        database: "app_development",
        environmentColor: "#3985d6",
      },
      {
        name: "Production · read replica",
        host: "replica.example.test",
        database: "analytics",
        environmentColor: "#35a881",
      },
    ]) {
      await window.dbapp.request({
        kind: "connections.save",
        requestId: crypto.randomUUID() as never,
        profile: {
          ...profile,
          id: crypto.randomUUID() as never,
          port: 5432,
          user: "analyst",
          tls: { kind: "verify-full" },
        },
      });
    }
  });
  await page.reload();
  await page.getByRole("button", { name: "Select Development", exact: true }).click();
  await expect(page.getByLabel("Host", { exact: true })).toHaveValue("dev.example.test");
  await expect(
    page.getByRole("button", { name: "Select Development", exact: true }),
  ).toHaveAccessibleDescription("dev.example.test:5432 / app_development");
  await page.getByRole("searchbox", { name: "Search connections", exact: true }).fill("analytics");
  await expect(
    page.getByRole("button", { name: "Select Production · read replica" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Development", exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("searchbox", { name: "Search connections", exact: true })
    .fill("dev.example");
  await expect(page.getByRole("button", { name: "Select Development", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search connections", exact: true }).fill("");
  await page.getByLabel("Name", { exact: true }).fill("Unsaved name");
  await page.getByLabel("Password", { exact: true }).fill("temporary-ui-sentinel");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  expect(await page.getByLabel("Password", { exact: true }).getAttribute("name")).toBeNull();
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Select Local playground", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Unsaved name");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("temporary-ui-sentinel");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Development");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Mint", exact: true }).click();
  await page.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Connection saved");
  await page.getByRole("button", { name: "Select Development", exact: true }).click();
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 800),
  );
  await page.locator(".connection-manager-host").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByLabel("Appearance").selectOption("light");
  await page.screenshot({
    path: "test-results/connection-manager-light.png",
    animations: "disabled",
  });
  await page.getByLabel("Appearance").selectOption("dark");
  await page.screenshot({
    path: "test-results/connection-manager-dark.png",
    animations: "disabled",
  });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(760, 650),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    await page
      .locator(".connection-manager-host")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/connection-manager-narrow.png",
    animations: "disabled",
  });
});

test("finishing an earlier connection attempt cannot unlock a later save", async () => {
  const page = await launch();
  await page.evaluate(async () => {
    for (const name of ["First", "Second", "Third"]) {
      await window.dbapp.request({
        kind: "connections.save",
        requestId: crypto.randomUUID() as never,
        profile: {
          id: crypto.randomUUID() as never,
          name,
          host: "127.0.0.1",
          port: 1,
          database: "postgres",
          user: "postgres",
          tls: { kind: "verify-full" },
          environmentColor: "#7c3aed",
        },
      });
    }
  });
  await page.reload();
  // Delay real IPC operations in the test process, without a production timing hook.
  await application.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, "_invokeHandlers") as Map<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    const original = handlers.get("dbapp:request");
    if (!original) throw new Error("Missing application IPC handler");
    const gates = { releaseConnect: () => {}, releaseSave: () => {}, saveStarted: false };
    const connectGate = new Promise<void>((resolve) => {
      gates.releaseConnect = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      gates.releaseSave = resolve;
    });
    Reflect.set(globalThis, "connectionRaceGates", gates);
    ipcMain.removeHandler("dbapp:request");
    ipcMain.handle("dbapp:request", async (event, command) => {
      if (command.kind === "connections.connect") await connectGate;
      if (command.kind === "connections.save" && command.profile.name === "Second edited") {
        gates.saveStarted = true;
        await saveGate;
      }
      return original(event, command);
    });
  });
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.getByRole("button", { name: "Select First", exact: true }).click();
    await page.getByRole("button", { name: "Save & connect", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Connecting…");
    await page.getByRole("button", { name: "Select Second", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Second edited");
    await page.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect
      .poll(() =>
        application.evaluate(() => Reflect.get(globalThis, "connectionRaceGates").saveStarted),
      )
      .toBe(true);
    await application.evaluate(() =>
      Reflect.get(globalThis, "connectionRaceGates").releaseConnect(),
    );
    await expect(page.getByRole("status")).toContainText("Database connection failed");
    await page.getByRole("button", { name: "Select Third", exact: true }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Second edited");
    await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
    await application.evaluate(() => Reflect.get(globalThis, "connectionRaceGates").releaseSave());
    await expect(page.getByRole("status")).toContainText("Connection saved");
    await page.getByRole("button", { name: "Select Third", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Third draft");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Third draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  } finally {
    await application.evaluate(() => {
      const gates = Reflect.get(globalThis, "connectionRaceGates");
      gates.releaseConnect();
      gates.releaseSave();
    });
  }
});
