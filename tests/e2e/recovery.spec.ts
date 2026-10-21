import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
test("restart recovers invalid JSON as a detached copy with no connection or query execution", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-recovery-"));
  const launch = () =>
    electron.launch({ args: [path.resolve("."), `--user-data-dir=${directory}`] });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.clock.install();
    await expect(page.getByLabel("Workspace recovery", { exact: true })).toBeVisible();
    // Drain the initial debounced layout save before seeding recovery out of band.
    await page.clock.runFor(300);
    const reply = await page.evaluate(() =>
      window.dbapp.request({
        kind: "workspace.save",
        requestId: "seed" as never,
        state: {
          version: 1,
          recoveryEnabled: true,
          theme: "dark",
          layout: { sqlOpened: false, showSql: false },
          sql: ["delete from never_run"],
          drafts: [{ id: "detached", kind: "json", label: "JSON local copy", text: '{"invalid' }],
        },
      }),
    );
    expect(reply.ok).toBe(true);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByLabel("Recovered json draft")).toHaveValue('{"invalid');
    await expect(page.getByText("No connection", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run SQL / selection" })).toHaveCount(0);
    await expect(page.getByLabel("Recovered json draft")).toBeFocused();
    await page.getByRole("button", { name: "Keep local copies", exact: true }).click();
    const review = page.getByRole("button", { name: "Review recovered drafts (1)", exact: true });
    await review.click();
    await expect(page.getByLabel("Recovered json draft")).toBeFocused();
    await page.getByRole("button", { name: "Keep local copies", exact: true }).click();
    await expect(review).toBeFocused();
    // Connecting must preserve detached copies without asking to discard them.
    await page.getByRole("button", { name: "New connection", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Recovery reconnect");
    await page.getByLabel("Port", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Save connection", exact: true }).click();
    const warnings: string[] = [];
    page.on("dialog", async (dialog) => {
      warnings.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Connect Recovery reconnect", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Database connection failed");
    expect(warnings).toEqual([]);
    await review.click();
    await expect(page.getByLabel("Recovered json draft")).toHaveValue('{"invalid');
    await page.getByRole("button", { name: "Keep local copies", exact: true }).click();
    await page.getByLabel("Recover drafts on this device").uncheck();
    await expect(page.getByRole("dialog", { name: "Recovered drafts" })).toBeHidden();
    const stored = await page.evaluate(() =>
      window.dbapp.request({ kind: "workspace.load", requestId: "read" as never }),
    );
    expect(stored).toMatchObject({
      ok: true,
      data: { recoveryEnabled: false, sql: [], drafts: [] },
    });
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("closing recovered unsaved work can cancel or explicitly discard", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-close-"));
  const launch = () =>
    electron.launch({ args: [path.resolve("."), `--user-data-dir=${directory}`] });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.clock.install();
    await expect(page.getByLabel("Workspace recovery", { exact: true })).toBeVisible();
    await page.clock.runFor(300);
    await page.evaluate(() =>
      window.dbapp.request({
        kind: "workspace.save",
        requestId: "seed-close" as never,
        state: {
          version: 1,
          recoveryEnabled: true,
          theme: "system",
          layout: { sqlOpened: false, showSql: false },
          sql: [],
          drafts: [{ id: "invalid", kind: "json", label: "unsaved", text: "{" }],
        },
      }),
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByLabel("Recovered json draft")).toHaveValue("{");
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBoxSync = () => 0;
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect(page.getByLabel("Recovered json draft")).toHaveValue("{");
    const closed = page.waitForEvent("close");
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBoxSync = () => 1;
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await closed;
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
