import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
let application: ElectronApplication;
let directory: string;
test.beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "dbapp-security-"));
  application = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
  });
  await application.firstWindow();
});
test.afterEach(async () => {
  await application.close();
  rmSync(directory, { recursive: true, force: true });
});
test("renderer cannot access Node", async () => {
  const page = await application.firstWindow();
  expect(await page.evaluate(() => typeof Reflect.get(window, "require"))).toBe("undefined");
  expect(await page.evaluate(() => typeof Reflect.get(window, "process"))).toBe("undefined");
});
test("untrusted sender rejected", async () => {
  // An attacker-controlled renderer calls real IPC directly.
  // This tests the main-process boundary independently of preload validation.
  const result = await application.evaluate(async ({ BrowserWindow }, preload) => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { preload, contextIsolation: true, sandbox: true },
    });
    await window.loadURL("about:blank");
    try {
      return await window.webContents.executeJavaScript(
        "window.attack({kind:'app.info',requestId:'untrusted'})",
      );
    } catch {
      return { ok: false, error: { code: "HANDLER_MISSING" } };
    } finally {
      window.destroy();
    }
  }, path.resolve("tests/fixtures/untrusted-preload.cjs"));
  expect(result).toMatchObject({ ok: false, error: { code: "UNTRUSTED_SENDER" } });
});
test("malformed command rejected", async () => {
  const page = await application.firstWindow();
  const result = await page.evaluate(async () => {
    const bridge = Reflect.get(window, "dbapp");
    if (!bridge) return { ok: false, error: { code: "BRIDGE_MISSING" } };
    return Reflect.apply(bridge.request, bridge, [
      { kind: "filesystem.read", requestId: "malformed", path: "/etc/passwd" },
    ]);
  });
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
});

test("bridge exposes only validated operations and rejects oversized requests", async () => {
  const page = await application.firstWindow();
  const result = await page.evaluate(async () => ({
    keys: Object.keys(window.dbapp).sort(),
    valid: await Reflect.apply(window.dbapp.request, window.dbapp, [
      { kind: "app.info", requestId: "control" },
    ]),
    oversized: await Reflect.apply(window.dbapp.request, window.dbapp, [
      { kind: "app.info", requestId: "x".repeat(70000) },
    ]),
  }));
  expect(result.keys).toEqual(["request", "subscribe", "unsubscribe"]);
  expect(result.valid).toMatchObject({ ok: true, requestId: "control", kind: "app.info" });
  expect(result.oversized).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
});

test("unexpected navigation and new windows are blocked", async () => {
  const page = await application.firstWindow();
  const original = page.url();
  await page.evaluate(() => {
    window.open("https://example.invalid");
    location.href = "https://example.invalid";
  });
  await expect.poll(() => application.windows().length).toBe(1);
  expect(page.url()).toBe(original);
});

test("Rowberry shell loads Baloo 2 wordmark text and keyboard-accessible light/dark appearance", async () => {
  const page = await application.firstWindow();
  await expect(page.getByRole("heading", { name: "Your database workspace" })).toBeVisible();
  await expect(page).toHaveTitle("Rowberry");
  const wordmark = page.getByText("rowberry", { exact: true });
  await expect(wordmark).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await wordmark.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    "Baloo 2",
  );
  expect(await page.evaluate(() => document.fonts.check('800 30px "Baloo 2"'))).toBe(true);
  expect(
    await application.evaluate(({ app }) => ({
      name: app.getName(),
      userData: app.getPath("userData"),
    })),
  ).toEqual({ name: "Rowberry", userData: directory });
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ animations: "disabled", path: "test-results/rowberry-dark.png" });
  await page.getByRole("button", { name: "New connection", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ animations: "disabled", path: "test-results/rowberry-dark-dialog.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Appearance").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ animations: "disabled", path: "test-results/rowberry-light.png" });
});

test("macOS window reopen keeps one session download guard", async () => {
  test.skip(process.platform !== "darwin", "macOS keeps the application alive after window close");
  const counts = await application.evaluate(async ({ app, BrowserWindow }) => {
    const first = BrowserWindow.getAllWindows()[0];
    if (!first) throw new Error("Missing original window");
    const session = first.webContents.session;
    const before = session.listenerCount("will-download");
    const closed = new Promise<void>((resolve) => first.once("closed", () => resolve()));
    first.close();
    await closed;
    app.emit("activate");
    const reopened = BrowserWindow.getAllWindows()[0];
    if (!reopened || reopened === first) throw new Error("Window did not reopen");
    return { before, after: session.listenerCount("will-download") };
  });
  expect(counts).toEqual({ before: 1, after: 1 });
});
