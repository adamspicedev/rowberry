import { test, expect, _electron as electron } from "@playwright/test";
import { Client } from "pg";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";

test("JSON sidebar filters nested values, preserves drafts and inspects full rows", async () => {
  test.setTimeout(60000);
  const client = new Client({
    host: "localhost",
    port: 55418,
    database: "fixture",
    user: "fixture",
    password: "fixture-only-password",
  });
  const schema = `json_viewer_${crypto.randomUUID().replaceAll("-", "")}`;
  await client.connect();
  await client.query(
    `CREATE SCHEMA "${schema}"; CREATE TABLE "${schema}".records(id int PRIMARY KEY, name text, doc json); INSERT INTO "${schema}".records VALUES (1, 'Poppy', '{"profile":{"food":"puppy mix"},"exact":12345678901234567890}'), (2, 'Milo', '{"profile":{"food":"hay"}}')`,
  );
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-viewer-"));
  const app = await electron.launch({ args: [path.resolve("."), `--user-data-dir=${directory}`] });
  const page = await app.firstWindow();
  async function request(command: Record<string, unknown>) {
    const reply = ReplySchema.parse(
      await page.evaluate(
        async (command) =>
          Reflect.apply(window.dbapp.request, window.dbapp, [
            { ...command, requestId: crypto.randomUUID() },
          ]),
        command,
      ),
    );
    expect(reply.ok).toBe(true);
    return reply;
  }
  try {
    const id = crypto.randomUUID();
    await request({
      kind: "connections.save",
      profile: {
        id,
        name: "Viewer fixture",
        host: "localhost",
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
    await page.getByRole("button", { name: "Connect Viewer fixture", exact: true }).click();
    await page.getByRole("button", { name: "SQL workspace", exact: true }).click();
    await page.getByRole("textbox", { name: "SQL editor" }).focus();
    await page.keyboard.type(
      `SELECT 3 AS id, '{"profile":{"a/b~c":"needle"},"exact":12345678901234567890,"other":true}'::json AS doc, NULL::text AS absent`,
    );
    await page.getByRole("button", { name: "Run SQL / selection", exact: true }).click();
    await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
    const panel = page.getByRole("region", { name: "JSON inspector", exact: true });
    await expect(panel.getByRole("tree")).toContainText("12345678901234567890");
    await expect(panel.getByLabel("JSON edit pointer", { exact: true })).toBeHidden();
    await expect(panel.getByRole("textbox", { name: "JSON text editor" })).toBeHidden();
    const grid = page.getByRole("table", { name: "SQL results" });
    const panelBox = await panel.boundingBox();
    const gridBox = await grid.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    if (panelBox && gridBox) expect(gridBox.x + gridBox.width).toBeLessThanOrEqual(panelBox.x + 2);
    await panel.getByRole("textbox", { name: "Search JSON keys and values" }).fill("needle");
    await expect(panel).toContainText("1 matches");
    await expect(panel.getByRole("tree")).toContainText("a/b~c");
    await expect(panel.getByRole("tree")).not.toContainText("exact");
    await panel.getByRole("textbox", { name: "Search JSON keys and values" }).fill("");
    await expect(panel.getByRole("tree")).toContainText("exact");
    await panel.getByRole("button", { name: "Resize JSON panel", exact: true }).focus();
    const initialWidth = (await panel.boundingBox())?.width ?? 0;
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await panel.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialWidth);
    await panel.getByRole("button", { name: "Edit JSON", exact: true }).click();
    await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/other");
    await panel.getByLabel("JSON new value", { exact: true }).fill("changed");
    await panel.getByRole("button", { name: "Set value", exact: true }).click();
    await expect(panel).toContainText("unsaved draft");
    await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
    await panel.getByRole("button", { name: "Keep editing JSON", exact: true }).click();
    await expect(panel.getByRole("tree")).toContainText("changed");
    await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
    await panel.getByRole("button", { name: "Discard and close JSON", exact: true }).click();
    await page.getByRole("button", { name: "Inspect row 1 as JSON", exact: true }).click();
    await expect(panel).toContainText("Row as JSON");
    await expect(panel.getByRole("button", { name: "Edit JSON", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Expand doc", exact: true }).click();
    await expect(panel.getByRole("tree")).toContainText("12345678901234567890");
    await expect(panel.getByRole("tree")).toContainText('"absent":null');
    await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
    await page.getByRole("button", { name: "Table workspace", exact: true }).click();
    await page.getByRole("textbox", { name: "Search schemas and tables" }).fill(schema);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: `records ${schema} · table`, exact: true }).click();
    const rows = page.getByRole("grid", { name: "Table rows" });
    await expect(rows.getByRole("gridcell")).toHaveCount(6);
    await page.getByRole("button", { name: "Inspect selected row", exact: true }).click();
    await expect(panel.getByRole("tree")).toContainText("Poppy");
    await rows.getByRole("gridcell").nth(3).click();
    await expect(panel.getByRole("tree")).toContainText("Milo");
    await expect(panel.getByRole("tree")).not.toContainText("Poppy");
    await rows.focus();
    await page.keyboard.press("ArrowUp");
    await expect(panel.getByRole("tree")).toContainText("Poppy");
    await panel.getByLabel("JSON viewer actions", { exact: true }).click();
    await panel.getByRole("button", { name: "Expand all", exact: true }).click();
    await panel.getByLabel("JSON viewer actions", { exact: true }).click();
    await expect(panel.getByRole("tree")).toContainText("puppy mix");
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000),
    );
    await page.screenshot({ path: "/tmp/rowberry-json-sidebar.png" });
    await rows.getByRole("gridcell").nth(2).dblclick();
    await expect(panel).toContainText("JSON viewer");
    await expect(panel.getByRole("button", { name: "Edit JSON", exact: true })).toBeVisible();
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    rmSync(directory, { recursive: true, force: true });
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});
