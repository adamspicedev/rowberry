import { test, expect, _electron as electron } from "@playwright/test";
import { Client } from "pg";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
test("schema tree, reusable menus and toast undo preserve database data", async () => {
  const db = new Client({
    host: "localhost",
    port: 55418,
    database: "fixture",
    user: "fixture",
    password: "fixture-only-password",
  });
  await db.connect();
  const schema = `menu_qa_${Date.now()}`;
  await db.query(
    `CREATE SCHEMA "${schema}"; CREATE TABLE "${schema}"."odd""table" (id integer PRIMARY KEY, description text); INSERT INTO "${schema}"."odd""table" VALUES (1, 'Sample');`,
  );
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-menu-"));
  const app = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1024, 768));
    await page.evaluate(async () => {
      const id = crypto.randomUUID();
      const request = (command: object) =>
        Reflect.apply(window.dbapp.request, window.dbapp, [
          { ...command, requestId: crypto.randomUUID() },
        ]);
      await request({
        kind: "connections.save",
        profile: {
          id,
          name: "Menu QA",
          host: "localhost",
          port: 55418,
          database: "fixture",
          user: "fixture",
          environmentColor: "#7c3aed",
          tls: { kind: "disable", acknowledged: true },
        },
      });
      await request({
        kind: "connections.submitSecret",
        id,
        secret: "fixture-only-password",
        persist: false,
      });
    });
    await page.reload();
    await page.getByRole("button", { name: "Connect Menu QA", exact: true }).click();
    await page.getByRole("textbox", { name: "Search schemas and tables" }).fill(schema);
    const table = page.getByRole("button", { name: `odd"table ${schema} · table`, exact: true });
    await expect(table).toBeVisible();
    await page.getByRole("button", { name: `Expand ${schema}.odd"table columns` }).click();
    await expect(page.locator(".entity-columns")).toContainText("integer");
    await table.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "View data", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "View structure", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(table).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "View data", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Actions for ${schema}.odd"table` }),
    ).toBeFocused();
    await table.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "View data", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Collapse ${schema}.odd"table columns` }),
    ).toBeFocused();
    await table.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy qualified name", exact: true }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      `"${schema}"."odd""table"`,
    );
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Name copied");
    await table.click({ button: "right" });
    await page.getByRole("menuitem", { name: "View structure", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Nullable");
    await expect(page.getByRole("dialog")).toContainText("Key");
    await page.getByRole("button", { name: "Close structure" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(table).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "View data", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "View structure", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(table).toBeFocused();
    await page.clock.install();
    await table.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide from sidebar" }).click();
    await expect(table).toBeHidden();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    // Pointer departure must not restart expiry while a button has keyboard focus.
    await undo.hover();
    await undo.focus();
    await page.mouse.move(0, 0);
    await page.clock.fastForward(8000);
    await expect(undo).toBeFocused();
    // Focus departure must not restart expiry while the pointer remains over it.
    await undo.hover();
    await page.getByRole("textbox", { name: "Search schemas and tables" }).focus();
    await page.clock.fastForward(8000);
    await expect(undo).toBeVisible();
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(table).toBeVisible();
    await table.click({ button: "right" });
    await page.getByRole("menuitem", { name: "SQL: Select top 200" }).click();
    await expect(page.getByRole("textbox", { name: "SQL editor", exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "SQL results" })).toHaveCount(0);
    await page.getByRole("button", { name: "Run SQL / selection", exact: true }).click();
    await expect(page.getByRole("table", { name: "SQL results" })).toContainText("Sample");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 960));
    await page.getByLabel("Appearance").selectOption("light");
    await table.click({ button: "right" });
    await page.screenshot({ path: "/tmp/rowberry-schema-menu-light.png", animations: "disabled" });
    await page.getByRole("textbox", { name: "Search schemas and tables" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1024, 768));
    await page.getByLabel("Appearance").selectOption("dark");
    await table.click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    const bounds = await page.getByRole("menu").boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
    await page.screenshot({ path: "/tmp/rowberry-schema-menu-dark.png", animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Refresh schemas", exact: true }).click();
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText(
      "Schema refreshed",
    );
    const dismissRefresh = page.getByRole("button", { name: "Dismiss Schema refreshed" });
    await dismissRefresh.hover();
    await dismissRefresh.focus();
    await page.getByRole("textbox", { name: "Search schemas and tables" }).focus();
    await page.mouse.move(0, 0);
    await page.clock.fastForward(8000);
    await expect(page.getByRole("region", { name: "Notifications" })).not.toContainText(
      "Schema refreshed",
    );
    expect((await db.query(`SELECT count(*) FROM "${schema}"."odd""table"`)).rows[0].count).toBe(
      "1",
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    rmSync(directory, { recursive: true, force: true });
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.end();
  }
});
