import { test, expect, _electron as electron, type Locator } from "@playwright/test";
import { Client } from "pg";
import { createServer, connect as connectSocket, type Socket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";
async function openJsonEditing(panel: Locator) {
  await expect(panel).toBeVisible();
  const edit = panel.getByRole("button", { name: "Edit JSON", exact: true });
  if (await edit.isVisible()) await edit.click();
}

for (const version of [14, 18])
  test(`guarded cell batch and JSON preview save conflict PG${version}`, async () => {
    test.setTimeout(60000);
    const client = new Client({
      host: "localhost",
      port: 55400 + version,
      database: "fixture",
      user: "fixture",
      password: "fixture-only-password",
    });
    await client.connect();
    await client.query(
      `DROP SCHEMA IF EXISTS dbapp_save_ui CASCADE;CREATE SCHEMA dbapp_save_ui;CREATE TABLE dbapp_save_ui.other(id int PRIMARY KEY);CREATE TABLE dbapp_save_ui.records(id int PRIMARY KEY,note text,doc json,derived int GENERATED ALWAYS AS (id+1) STORED);INSERT INTO dbapp_save_ui.records(id,note,doc) VALUES(1,'original','{"n":9007199254740993}'),(2,'neighbour','null');`,
    );
    const directory = mkdtempSync(path.join(tmpdir(), "rowberry-save-"));
    let app = await electron.launch({
      executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
      args: [
        ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
        `--user-data-dir=${directory}`,
      ],
    });
    let page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1800, 1100),
    );
    const request = async (command: Record<string, unknown>) =>
      ReplySchema.parse(
        await page.evaluate(
          (command) =>
            Reflect.apply(window.dbapp.request, window.dbapp, [
              { ...command, requestId: crypto.randomUUID() },
            ]),
          command,
        ),
      );
    try {
      async function jsonRecoveryCount() {
        const reply = await request({ kind: "workspace.load" });
        if (!reply.ok || reply.kind !== "workspace.load") throw new Error("Recovery read failed");
        return reply.data.drafts.filter((draft) => draft.kind === "json").length;
      }
      const id = crypto.randomUUID();
      await request({
        kind: "connections.save",
        profile: {
          id,
          name: "Save fixture",
          host: "localhost",
          port: 55400 + version,
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
      await page.getByRole("button", { name: "Connect Save fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Search schemas and tables" }).fill("dbapp_save_ui");
      await page
        .getByRole("button", { name: "records dbapp_save_ui · table", exact: true })
        .click();
      const grid = page.getByRole("grid", { name: "Table rows" });
      await expect(grid).toBeVisible();
      async function stage(index: number, text: string | null) {
        await grid.getByRole("gridcell").nth(index).click();
        await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
        if (text === null)
          await page.getByRole("checkbox", { name: "SQL NULL", exact: true }).check();
        else await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill(text);
        await page.getByRole("button", { name: "Stage cell", exact: true }).click();
      }
      await grid.getByRole("gridcell").nth(1).click();
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
      await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill("unstaged source");
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveValue(
        "unstaged source",
      );
      await grid.getByRole("gridcell").nth(4).click();
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveValue(
        "unstaged source",
      );
      await page.getByRole("button", { name: "Cancel cell edit", exact: true }).click();
      await stage(1, "saved");
      await page.getByRole("button", { name: "Select Save fixture", exact: true }).click();
      await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
      await expect(page.getByText("Disconnect to edit this connection.")).toBeVisible();
      await page.getByRole("tab", { name: /^records/ }).click();
      expect(
        await request({
          kind: "connections.save",
          profile: {
            id,
            name: "Wrong database",
            host: "localhost",
            port: 55400 + version,
            user: "fixture",
            database: "postgres",
            tls: { kind: "disable", acknowledged: true },
            environmentColor: "#ff0000",
          },
        }),
      ).toMatchObject({ ok: false });
      await expect(
        page.getByRole("button", { name: "Connect Save fixture", exact: true }),
      ).toBeVisible();
      const profiles = await request({ kind: "connections.list", offset: 0 });
      expect(profiles).toMatchObject({
        ok: true,
        data: { profiles: [{ name: "Save fixture", database: "fixture" }] },
      });

      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Confirm database changes" });
      await expect(preview.getByRole("button", { name: "Cancel preview" })).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await expect(preview.getByRole("button", { name: "Cancel preview" })).toBeFocused();
      expect(await preview.evaluate((element) => element.matches(":modal"))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(preview).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Preview changes", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(preview.getByLabel("Original note")).toHaveText("original");
      await expect(preview.getByLabel("Pending note")).toHaveText("saved");
      expect(
        (await client.query("SELECT note FROM dbapp_save_ui.records WHERE id=1")).rows[0].note,
      ).toBe("original");
      await preview.getByRole("button", { name: "Cancel preview" }).click();
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await client.query("BEGIN");
      try {
        await client.query("SELECT id FROM dbapp_save_ui.records WHERE id=1 FOR UPDATE");
        await preview.getByRole("button", { name: "Confirm save" }).click();
        await expect(preview.getByRole("status")).toHaveText("Saving…");
        await page.keyboard.press("Escape");
        await expect(preview).toBeVisible();
        await expect(preview.getByRole("button", { name: "Cancel preview" })).toBeDisabled();
      } finally {
        await client.query("ROLLBACK");
      }
      await expect(page.getByText("Changes committed", { exact: true })).toBeVisible();
      expect(
        (await client.query("SELECT note FROM dbapp_save_ui.records ORDER BY id")).rows.map(
          (row) => row.note,
        ),
      ).toEqual(["saved", "neighbour"]);
      await stage(1, "preserved conflict draft");
      await client.query("UPDATE dbapp_save_ui.records SET note='external' WHERE id=1");
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await preview.getByRole("button", { name: "Confirm save" }).click();
      await expect(
        page.getByRole("button", { name: "Compare current database rows" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await expect(preview.getByLabel("Pending note")).toHaveText("preserved conflict draft");
      await preview.getByRole("button", { name: "Cancel preview" }).click();
      await page.getByRole("button", { name: "Compare current database rows" }).click();
      await expect(
        page.getByRole("region", { name: "Compare database with preserved drafts" }),
      ).toContainText("external");
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Discard drafts and reload" }).click();
      await expect(grid.getByRole("gridcell").nth(1)).toHaveText("external");
      await stage(1, "must roll back");
      await stage(4, "invalid integer");
      await stage(5, "second row rollback draft");
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await expect(preview.getByText("Original row: id=1", { exact: true })).toBeVisible();
      await expect(preview.getByText("Original row: id=2", { exact: true })).toBeVisible();
      await preview.getByRole("button", { name: "Confirm save" }).click();
      await expect(
        page.getByRole("button", { name: "Preview changes", exact: true }),
      ).toBeEnabled();
      expect(
        (await client.query("SELECT note FROM dbapp_save_ui.records ORDER BY id")).rows.map(
          (row) => row.note,
        ),
      ).toEqual(["external", "neighbour"]);
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Discard table drafts", exact: true }).click();
      // Generated columns never acquire an editor.
      await grid.getByRole("gridcell").nth(3).click();
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Cell draft" })).toHaveCount(0);
      // Ordinary Edit routes JSON through the duplicate-free worker, never a raw cell editor.
      await grid.getByRole("gridcell").nth(2).click();
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
      const routedInspector = page.getByRole("region", { name: "JSON inspector", exact: true });
      await expect(routedInspector).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveCount(0);
      const routedText = routedInspector.getByRole("textbox", {
        name: "JSON text editor",
        exact: true,
      });
      await openJsonEditing(routedInspector);
      await routedText.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type('{"n":1,"n":2}');
      await expect(routedInspector.getByText(/Duplicate keys:/)).toBeVisible();
      await expect(
        routedInspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole("button", { name: "Stage cell", exact: true })).toHaveCount(0);
      await routedInspector.getByRole("button", { name: "Close JSON", exact: true }).click();
      await page.getByRole("button", { name: "Discard and close JSON", exact: true }).click();
      // Keep a clean inspector open while an ordinary same-row change rotates its target.
      await grid.getByRole("gridcell").nth(2).dblclick();
      await expect(routedInspector.getByRole("tree")).toBeVisible();
      // SQL NULL differs from the JSON literal null.
      await grid.focus();
      await page.keyboard.press("ArrowLeft");
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("checkbox", { name: "SQL NULL", exact: true }).focus();
      await page.keyboard.press("Space");
      await page.getByRole("button", { name: "Stage cell", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await preview.getByRole("button", { name: "Confirm save" }).click();
      await expect(grid.getByRole("gridcell").nth(1)).toHaveText("NULL");
      await expect(routedInspector).toHaveCount(0);
      await expect(page.getByText(/clean JSON inspector closed/)).toBeVisible();
      expect(
        (
          await client.query(
            "SELECT note IS NULL AS sql_null,doc::text FROM dbapp_save_ui.records WHERE id=1",
          )
        ).rows[0],
      ).toEqual({ sql_null: true, doc: '{"n":9007199254740993}' });
      await grid.getByRole("gridcell").nth(2).dblclick();
      const inspector = page.getByRole("region", { name: "JSON inspector", exact: true });
      await expect(inspector.getByRole("tree")).toBeVisible();
      await openJsonEditing(inspector);
      await inspector.getByLabel("JSON edit pointer", { exact: true }).fill("/n");
      await inspector.getByLabel("JSON value type", { exact: true }).selectOption("number");
      await inspector.getByLabel("JSON new value", { exact: true }).fill("99999999999999999999");
      await inspector.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(inspector.getByRole("tree")).toContainText("99999999999999999999");
      await inspector.getByRole("button", { name: "Done editing", exact: true }).click();
      await expect(
        inspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeEnabled();
      await inspector.getByRole("button", { name: "Save to database", exact: true }).click();
      await expect(preview).toBeVisible();
      await preview.getByRole("button", { name: "Confirm save" }).click();
      await expect(inspector).not.toContainText("unsaved draft");
      expect(
        (await client.query("SELECT doc::text FROM dbapp_save_ui.records WHERE id=1")).rows[0].doc,
      ).toContain("99999999999999999999");
      await expect.poll(jsonRecoveryCount).toBe(0);
      await openJsonEditing(inspector);
      const text = inspector.getByRole("textbox", { name: "JSON text editor", exact: true });
      await openJsonEditing(inspector);
      await expect(text).toBeEditable();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
      await text.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type('{"invalid":');
      await expect(inspector).toHaveAttribute("data-dirty", "true");
      await expect(
        inspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeDisabled();
      await inspector.getByRole("button", { name: "Close JSON", exact: true }).click();
      await page.getByRole("button", { name: "Discard and close JSON", exact: true }).click();
      await expect.poll(jsonRecoveryCount).toBe(0);
      await grid.getByRole("gridcell").nth(2).click();
      await page.getByRole("button", { name: "Stage selected SQL NULL", exact: true }).click();
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await expect(preview.getByLabel("Pending doc")).toHaveText("SQL NULL");
      await preview.getByRole("button", { name: "Confirm save", exact: true }).click();
      await expect(grid.getByRole("gridcell").nth(2)).toHaveText("NULL");
      expect(
        (
          await client.query(
            "SELECT doc IS NULL AS sql_null,doc::text FROM dbapp_save_ui.records ORDER BY id",
          )
        ).rows,
      ).toEqual([
        { sql_null: true, doc: null },
        { sql_null: false, doc: "null" },
      ]);
      await grid.getByRole("gridcell").nth(2).dblclick();
      const sqlNullPanel = page.getByRole("region", { name: "JSON inspection", exact: true });
      await expect(
        sqlNullPanel.getByRole("button", { name: "Create JSON value", exact: true }),
      ).toBeVisible();
      await sqlNullPanel.getByRole("button", { name: "Create JSON value", exact: true }).click();
      await openJsonEditing(inspector);
      await expect(inspector.getByRole("tree")).toBeVisible();
      await expect(inspector).toContainText("Creating JSON from SQL NULL");
      async function creationText(value: string) {
        await openJsonEditing(inspector);
        await inspector.getByRole("textbox", { name: "JSON text editor", exact: true }).focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.type(value);
      }
      await creationText('{"x":1,"x":2}');
      await expect(inspector.getByText(/Duplicate keys:/)).toBeVisible();
      await expect(
        inspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeDisabled();
      await creationText('{"broken":');
      await expect(
        inspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeDisabled();
      await creationText('{"created":true}');
      await inspector.getByRole("button", { name: "Save to database", exact: true }).click();
      await expect(preview.getByLabel("Original doc")).toHaveText("SQL NULL");
      await expect(preview.getByLabel("Pending doc")).toHaveText('{"created":true}');
      await preview.getByRole("button", { name: "Cancel preview", exact: true }).click();
      expect(
        (await client.query("SELECT doc IS NULL AS empty FROM dbapp_save_ui.records WHERE id=1"))
          .rows[0].empty,
      ).toBe(true);
      await inspector.getByRole("button", { name: "Close JSON", exact: true }).click();
      await page.getByRole("button", { name: "Discard and close JSON", exact: true }).click();
      expect(
        (await client.query("SELECT doc IS NULL AS empty FROM dbapp_save_ui.records WHERE id=1"))
          .rows[0].empty,
      ).toBe(true);
      await grid.getByRole("gridcell").nth(2).dblclick();
      await sqlNullPanel.getByRole("button", { name: "Create JSON value", exact: true }).click();
      await openJsonEditing(inspector);
      await expect(inspector.getByRole("tree")).toBeVisible();
      await creationText('{"created":true}');
      await inspector.getByRole("button", { name: "Save to database", exact: true }).click();
      await preview.getByRole("button", { name: "Confirm save", exact: true }).click();
      await expect(inspector).not.toContainText("Creating JSON from SQL NULL");
      expect(
        (await client.query("SELECT doc::text FROM dbapp_save_ui.records WHERE id=1")).rows[0].doc,
      ).toBe('{"created":true}');
      await inspector.getByRole("button", { name: "Close JSON", exact: true }).click();
      await grid.getByRole("gridcell").nth(2).click();
      await page.getByRole("button", { name: "Stage selected SQL NULL", exact: true }).click();
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await preview.getByRole("button", { name: "Confirm save", exact: true }).click();
      await expect(grid.getByRole("gridcell").nth(2)).toHaveText("NULL");
      await grid.getByRole("gridcell").nth(2).dblclick();
      await sqlNullPanel.getByRole("button", { name: "Create JSON value", exact: true }).click();
      await openJsonEditing(inspector);
      await expect(inspector.getByRole("tree")).toBeVisible();
      await inspector.getByRole("button", { name: "Save to database", exact: true }).click();
      await expect(preview.getByLabel("Original doc")).toHaveText("SQL NULL");
      await expect(preview.getByLabel("Pending doc")).toHaveText("JSON null");
      await preview.getByRole("button", { name: "Confirm save", exact: true }).click();
      await expect(inspector).not.toContainText("unsaved draft");
      expect(
        (
          await client.query(
            "SELECT doc IS NULL AS sql_null,doc::text FROM dbapp_save_ui.records ORDER BY id",
          )
        ).rows,
      ).toEqual([
        { sql_null: false, doc: "null" },
        { sql_null: false, doc: "null" },
      ]);
      // Repeated acknowledged replacements must not accumulate outgoing recovery IDs.
      for (let cycle = 0; cycle < 34; cycle++) {
        await openJsonEditing(inspector);
        await inspector.getByLabel("JSON edit pointer", { exact: true }).fill("");
        await inspector.getByLabel("JSON value type", { exact: true }).selectOption("number");
        await inspector.getByLabel("JSON new value", { exact: true }).fill(String(cycle));
        await inspector.getByRole("button", { name: "Set value", exact: true }).click();
        await expect(inspector).toHaveAttribute("data-dirty", "true");
        await inspector.getByRole("button", { name: "Save to database", exact: true }).click();
        await preview.getByRole("button", { name: "Confirm save", exact: true }).click();
        await expect(inspector).toHaveAttribute("data-dirty", "false");
      }
      await expect.poll(jsonRecoveryCount).toBe(0);
      await openJsonEditing(inspector);
      await inspector.getByLabel("JSON new value", { exact: true }).fill("888");
      await inspector.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(inspector).toHaveAttribute("data-dirty", "true");
      await expect.poll(jsonRecoveryCount).toBe(1);
      page.once("dialog", (dialog) => dialog.accept());
      await grid.getByRole("gridcell").nth(6).focus();
      await page.keyboard.press("Enter");
      await expect.poll(jsonRecoveryCount).toBe(0);
      await openJsonEditing(inspector);
      await inspector.getByLabel("JSON new value", { exact: true }).fill("parent discard");
      await inspector.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(inspector).toHaveAttribute("data-dirty", "true");
      await expect.poll(jsonRecoveryCount).toBe(1);
      await page.getByRole("button", { name: "other dbapp_save_ui · table", exact: true }).click();
      await expect(inspector).toHaveCount(0);
      await expect.poll(jsonRecoveryCount).toBe(1);
      await page.getByRole("tab", { name: /^records/ }).click();
      await expect(inspector).toHaveAttribute("data-dirty", "true");
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Close records", exact: true }).click();
      await expect.poll(jsonRecoveryCount).toBe(0);
      await app.close();
      app = await electron.launch({
        executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
        args: [
          ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
          `--user-data-dir=${directory}`,
        ],
      });
      page = await app.firstWindow();
      await expect(
        page.getByRole("button", { name: "Connect Save fixture", exact: true }),
      ).toBeVisible();
      expect(await jsonRecoveryCount()).toBe(0);
      await request({
        kind: "connections.submitSecret",
        id,
        secret: "fixture-only-password",
        persist: false,
      });
      await page.getByRole("button", { name: "Connect Save fixture", exact: true }).click();
      await page.getByRole("textbox", { name: "Search schemas and tables" }).fill("dbapp_save_ui");
      await page
        .getByRole("button", { name: "records dbapp_save_ui · table", exact: true })
        .click();
      await page.getByRole("grid", { name: "Table rows" }).getByRole("gridcell").nth(2).dblclick();
      const failedInspector = page.getByRole("region", { name: "JSON inspector", exact: true });
      await openJsonEditing(failedInspector);
      await failedInspector.getByLabel("JSON value type", { exact: true }).selectOption("number");
      await failedInspector.getByLabel("JSON new value", { exact: true }).fill("777");
      await failedInspector.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(failedInspector).toHaveAttribute("data-dirty", "true");
      await client.query("UPDATE dbapp_save_ui.records SET doc='456' WHERE id=1");
      await failedInspector.getByRole("button", { name: "Save to database", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Confirm database changes" })
        .getByRole("button", { name: "Confirm save", exact: true })
        .click();
      await expect(
        page.getByText(
          "A row changed, was deleted, or is no longer writable. No edits were saved. Reload and compare your retained draft.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(failedInspector).toHaveAttribute("data-dirty", "true");
      await expect.poll(jsonRecoveryCount).toBe(1);
      // Recover exact editor text, even when it cannot be parsed or safely represented as JS numbers.
      const interruptedText = '{"name":"Pōhutukawa 🌳","exact":900719925474099312345,"unfinished":';
      const interruptedEditor = failedInspector.getByRole("textbox", {
        name: "JSON text editor",
        exact: true,
      });
      await interruptedEditor.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.insertText(interruptedText);
      await expect(
        failedInspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeDisabled();
      await expect
        .poll(async () => {
          const loaded = await request({ kind: "workspace.load" });
          return loaded.ok && loaded.kind === "workspace.load"
            ? loaded.data.drafts.find((draft) => draft.kind === "json")?.text
            : undefined;
        })
        .toBe(interruptedText);
      // Unexpected window destruction emits no explicit draft-discard event.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.destroy());
      await app.close();
      app = await electron.launch({
        executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
        args: [
          ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
          `--user-data-dir=${directory}`,
        ],
      });
      page = await app.firstWindow();
      await expect(page.getByLabel("Recovered json draft")).toHaveValue(interruptedText);
      expect(
        (await client.query("SELECT doc::text FROM dbapp_save_ui.records WHERE id=1")).rows[0].doc,
      ).toBe("456");
    } finally {
      // Test teardown explicitly discards live editors; user close remains guarded.
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      );
      await app.close();
      await client.end();
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("real IPC transports large save request/reply and rejects aggregate raw overflow", async () => {
  test.setTimeout(60000);
  const client = new Client({
    host: "localhost",
    port: 55418,
    database: "fixture",
    user: "fixture",
    password: "fixture-only-password",
  });
  await client.connect();
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS dbapp_save_ui;CREATE TABLE IF NOT EXISTS dbapp_save_ui.wire(id int PRIMARY KEY,note text,doc json);TRUNCATE dbapp_save_ui.wire;INSERT INTO dbapp_save_ui.wire SELECT i,'before','{}' FROM generate_series(1,30)i;`,
  );
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-save-wire-"));
  const app = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
  });
  const page = await app.firstWindow();
  await expect(page.locator("[data-app-ready]")).toBeVisible();
  async function request(command: Record<string, unknown>) {
    return ReplySchema.parse(
      await page.evaluate(
        (command) =>
          Reflect.apply(window.dbapp.request, window.dbapp, [
            { ...command, requestId: crypto.randomUUID() },
          ]),
        command,
      ),
    );
  }
  try {
    const id = crypto.randomUUID();
    await request({
      kind: "connections.save",
      profile: {
        id,
        name: "Wire fixture",
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
    const opened = await request({ kind: "connections.connect", id });
    if (!opened.ok || opened.kind !== "connections.connect") throw Error("No session");
    const owner = { sessionId: opened.data.sessionId, generation: opened.data.generation };
    await page
      .getByRole("textbox", { name: "Search schemas and tables" })
      .fill("dbapp_save_ui.wire");
    await expect(
      page.getByRole("button", { name: "wire dbapp_save_ui · table", exact: true }),
    ).toBeVisible();
    const schema = await request({ kind: "schema.list", ...owner });
    if (!schema.ok || schema.kind !== "schema.list") throw Error("No schema");
    const table = schema.data.tables.find(
      (table) => table.schema === "dbapp_save_ui" && table.name === "wire",
    );
    if (!table) throw Error("No table");
    const rows = await request({ kind: "rows.fetch", ...owner, tableId: table.id });
    if (!rows.ok || rows.kind !== "rows.fetch") throw Error("No rows");
    const source = '"' + "\\u0000".repeat(180000) + '"';
    const changes = rows.data.rows.map((row, index) => ({
      target: row.target,
      values: { note: "x".repeat(5000), ...(index === 0 ? { doc: source } : {}) },
    }));
    expect(Buffer.byteLength(JSON.stringify(changes))).toBeGreaterThan(1024 * 1024);
    const saved = await request({ kind: "rows.save", ...owner, changes });
    expect(saved.ok && saved.kind === "rows.save" && saved.data.kind).toBe("committed");
    expect(Buffer.byteLength(JSON.stringify(saved))).toBeGreaterThan(65536);
    expect(
      (await client.query("SELECT doc::text FROM dbapp_save_ui.wire WHERE id=1")).rows[0].doc,
    ).toBe(source);
    const overflow = await request({
      kind: "rows.save",
      ...owner,
      changes: [{ target: crypto.randomUUID(), values: { note: "😀".repeat(9 * 1024 * 1024) } }],
    });
    expect(overflow.ok).toBe(false);
    // Full-value reads cross utility worker, main and preload with encoded overhead.
    for (const character of ['"', "\\", "\u0001"]) {
      const text = JSON.stringify(
        character.repeat(character === "\u0001" ? 5 * 1024 * 1024 : 9 * 1024 * 1024),
      );
      await client.query("UPDATE dbapp_save_ui.wire SET doc=$1 WHERE id=1", [text]);
      const refreshed = await request({ kind: "rows.fetch", ...owner, tableId: table.id });
      if (!refreshed.ok || refreshed.kind !== "rows.fetch") throw Error("No refreshed rows");
      const value = await request({
        kind: "rows.value",
        ...owner,
        target: refreshed.data.rows[0]?.target,
        column: "doc",
      });
      expect(value.ok && value.kind === "rows.value" && value.data.text === text).toBe(true);
    }
  } finally {
    // Test teardown explicitly discards live editors; user close remains guarded.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    await client.end();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("lost real COMMIT acknowledgement preserves table draft and blocks retry", async () => {
  test.setTimeout(60000);
  const client = new Client({
    host: "localhost",
    port: 55418,
    database: "fixture",
    user: "fixture",
    password: "fixture-only-password",
  });
  await client.connect();
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS dbapp_save_ui;CREATE TABLE IF NOT EXISTS dbapp_save_ui.uncertain(id int PRIMARY KEY,note text);TRUNCATE dbapp_save_ui.uncertain;INSERT INTO dbapp_save_ui.uncertain VALUES(1,'before');`,
  );
  let armed = false,
    awaitingCommit = false;
  const sockets = new Set<Socket>();
  const proxy = createServer((downstream) => {
    const upstream = connectSocket({ host: "127.0.0.1", port: 55418 });
    sockets.add(downstream);
    sockets.add(upstream);
    downstream.on("error", () => {});
    upstream.on("error", () => {});
    downstream.on("data", (data) => {
      if (armed && data.toString("utf8").includes("COMMIT")) awaitingCommit = true;
      upstream.write(data);
    });
    upstream.on("data", (data) => {
      if (awaitingCommit) {
        upstream.destroy();
        downstream.destroy();
        return;
      }
      downstream.write(data);
    });
    downstream.on("close", () => upstream.destroy());
    upstream.on("close", () => downstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string") throw Error("No proxy port");
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-save-unknown-"));
  const app = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
  });
  const page = await app.firstWindow();
  async function request(command: Record<string, unknown>) {
    return ReplySchema.parse(
      await page.evaluate(
        (command) =>
          Reflect.apply(window.dbapp.request, window.dbapp, [
            { ...command, requestId: crypto.randomUUID() },
          ]),
        command,
      ),
    );
  }
  try {
    const id = crypto.randomUUID();
    await request({
      kind: "connections.save",
      profile: {
        id,
        name: "Uncertain fixture",
        host: "127.0.0.1",
        port: address.port,
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
    await page.getByRole("button", { name: "Connect Uncertain fixture", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Search schemas and tables" })
      .fill("dbapp_save_ui.uncertain");
    await page
      .getByRole("button", { name: "uncertain dbapp_save_ui · table", exact: true })
      .click();
    const grid = page.getByRole("grid", { name: "Table rows" });
    await expect(grid).toBeVisible();
    await grid.getByRole("gridcell").nth(1).click();
    await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Cell draft", exact: true })
      .fill("committed with lost acknowledgement");
    await page.getByRole("button", { name: "Stage cell", exact: true }).click();
    await page.getByRole("button", { name: "Preview changes", exact: true }).click();
    armed = true;
    const preview = page.getByRole("dialog", { name: "Confirm database changes" });
    await preview.getByRole("button", { name: "Confirm save" }).click();
    await expect(page.getByText(/may have committed/)).toBeVisible();
    expect(
      (await client.query("SELECT note FROM dbapp_save_ui.uncertain WHERE id=1")).rows[0].note,
    ).toBe("committed with lost acknowledgement");
    await page.getByRole("button", { name: "Preview changes", exact: true }).click();
    await expect(preview.getByLabel("Pending note")).toHaveText(
      "committed with lost acknowledgement",
    );
    await expect(preview.getByRole("button", { name: "Confirm save" })).toBeDisabled();
    await preview.getByRole("button", { name: "Cancel preview" }).click();
    await expect(grid.getByRole("gridcell").nth(1)).toHaveText("before");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Connect Uncertain fixture", exact: true }).click();
    await page.getByRole("button", { name: "Preview changes", exact: true }).click();
    await expect(preview.getByLabel("Pending note")).toHaveText(
      "committed with lost acknowledgement",
    );
    await expect(preview.getByRole("button", { name: "Confirm save" })).toBeDisabled();
  } finally {
    // Test teardown explicitly discards live editors; user close remains guarded.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await client.end();
    rmSync(directory, { recursive: true, force: true });
  }
});
