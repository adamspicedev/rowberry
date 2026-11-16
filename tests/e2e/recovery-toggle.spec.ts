import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { ReplySchema } from "../../src/shared/protocol";

for (const version of [14, 18])
  test(`re-enabling recovery snapshots only live editors before a crash PG${version}`, async () => {
    test.setTimeout(60000);
    const directory = mkdtempSync(path.join(tmpdir(), "rowberry-recovery-toggle-"));
    const schema = `recovery_toggle_${crypto.randomUUID().replaceAll("-", "")}`;
    const client = new Client({
      host: "localhost",
      port: 55400 + version,
      database: "fixture",
      user: "fixture",
      password: "fixture-only-password",
    });
    const launch = () =>
      electron.launch({
        executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
        args: [
          ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
          `--user-data-dir=${directory}`,
        ],
      });
    let app: ElectronApplication | undefined;
    try {
      await client.connect();
      await client.query(`
        CREATE SCHEMA "${schema}";
        CREATE TABLE "${schema}".writes(note text);
        CREATE TABLE "${schema}".kept_records(id int PRIMARY KEY, note text);
        CREATE TABLE "${schema}".discarded_records(id int PRIMARY KEY, note text);
        INSERT INTO "${schema}".kept_records VALUES (1,'original'),(2,'neighbour');
        INSERT INTO "${schema}".discarded_records VALUES (1,'original'),(2,'neighbour');
      `);
      app = await launch();
      let page = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setSize(1600, 1100),
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
      const stored = async () => {
        const reply = await request({ kind: "workspace.load" });
        if (!reply.ok || reply.kind !== "workspace.load") throw new Error("Recovery read failed");
        return {
          recoveryEnabled: reply.data.recoveryEnabled,
          sql: reply.data.sql,
          drafts: reply.data.drafts
            .map(({ kind, text }) => ({ kind, text }))
            .sort((a, b) => a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text)),
        };
      };
      const id = crypto.randomUUID();
      expect(
        await request({
          kind: "connections.save",
          profile: {
            id,
            name: "Recovery toggle fixture",
            host: "localhost",
            port: 55400 + version,
            user: "fixture",
            database: "fixture",
            tls: { kind: "disable", acknowledged: true },
            environmentColor: "#123456",
          },
        }),
      ).toMatchObject({ ok: true });
      const secret = () =>
        request({
          kind: "connections.submitSecret",
          id,
          secret: "fixture-only-password",
          persist: false,
        });
      expect(await secret()).toMatchObject({ ok: true });
      await page.reload();
      await page
        .getByRole("button", { name: "Connect Recovery toggle fixture", exact: true })
        .click();
      await expect(page.getByRole("textbox", { name: "Search schemas and tables" })).toBeVisible();

      const sqlText = `INSERT INTO "${schema}".writes VALUES ('never run automatically')`;
      const jsonText = '{"name":"Pōhutukawa 🌳","exact":900719925474099312345,"unfinished":';
      async function editSql(value: string) {
        await page.getByRole("textbox", { name: "SQL editor", exact: true }).focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.insertText(value);
      }
      async function openQueryWithJson(sql: string, json: string) {
        await page.getByRole("button", { name: "New SQL tab", exact: true }).click();
        await editSql(`SELECT '{"original":true}'::json AS doc`);
        await page.getByRole("button", { name: "Run SQL / selection", exact: true }).click();
        await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
        const inspector = page.getByRole("region", { name: "JSON inspector", exact: true });
        await inspector.getByRole("button", { name: "Edit JSON", exact: true }).click();
        await inspector.getByRole("textbox", { name: "JSON text editor", exact: true }).focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.insertText(json);
        await expect(inspector).toHaveAttribute("data-dirty", "true");
        await expect(inspector.getByRole("alert")).toBeVisible();
        await editSql(sql);
      }
      await openQueryWithJson(sqlText, jsonText);
      await openQueryWithJson("SELECT discarded_sql", '{"discarded_json":');

      async function openTableWithDrafts(name: string, staged: string, cell: string) {
        await page.getByRole("textbox", { name: "Search schemas and tables" }).fill(schema);
        await page.getByRole("button", { name: `${name} ${schema} · table`, exact: true }).click();
        const grid = page.getByRole("grid", { name: "Table rows", exact: true });
        await grid.getByRole("gridcell").nth(1).click();
        await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
        await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill(staged);
        await page.getByRole("button", { name: "Stage cell", exact: true }).click();
        await grid.getByRole("gridcell").nth(3).click();
        await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
        await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill(cell);
      }
      await openTableWithDrafts("kept_records", "kept staged value", "kept unfinished cell");
      await openTableWithDrafts("discarded_records", "discarded staged value", "discarded cell");
      // Require acknowledged persistence of real edits before changing the setting.
      await expect.poll(stored).toEqual({
        recoveryEnabled: true,
        sql: [sqlText, "SELECT discarded_sql"],
        drafts: [
          { kind: "cell", text: "discarded cell" },
          { kind: "cell", text: "kept unfinished cell" },
          { kind: "json", text: '{"discarded_json":' },
          { kind: "json", text: jsonText },
          { kind: "table", text: '[{"values":{"note":"discarded staged value"}}]' },
          { kind: "table", text: '[{"values":{"note":"kept staged value"}}]' },
        ],
      });
      const recovery = page.getByLabel("Recover drafts on this device", { exact: true });
      await recovery.uncheck();
      await expect.poll(stored).toEqual({ recoveryEnabled: false, sql: [], drafts: [] });

      // Explicitly discarded/closed editors must not be resurrected on re-enable.
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Discard table drafts", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveCount(0);
      await page.getByRole("tab", { name: /^SQL 2/ }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Close SQL 2", exact: true }).click();
      await expect(page.getByRole("tab", { name: /^SQL 2/ })).toHaveCount(0);
      await page.getByRole("tab", { name: /^kept_records/ }).click();
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveValue(
        "kept unfinished cell",
      );
      await expect.poll(stored).toEqual({ recoveryEnabled: false, sql: [], drafts: [] });

      // No editor change after re-enabling may be required to protect these copies.
      await recovery.check();
      const expected = {
        recoveryEnabled: true,
        sql: [sqlText],
        drafts: [
          { kind: "cell", text: "kept unfinished cell" },
          { kind: "json", text: jsonText },
          { kind: "table", text: '[{"values":{"note":"kept staged value"}}]' },
        ],
      };
      await expect.poll(stored).toEqual(expected);
      const crashed = once(app.process(), "exit");
      expect(app.process().kill("SIGKILL")).toBe(true);
      const [, signal] = await crashed;
      expect(signal).toBe("SIGKILL");

      app = await launch();
      page = await app.firstWindow();
      const recovered = page.getByRole("dialog", { name: "Recovered drafts", exact: true });
      await expect(recovered.getByLabel("Recovered json draft", { exact: true })).toHaveValue(
        jsonText,
      );
      await expect(recovered.getByLabel("Recovered cell draft", { exact: true })).toHaveValue(
        "kept unfinished cell",
      );
      await expect(recovered.getByLabel("Recovered table draft", { exact: true })).toHaveValue(
        '[{"values":{"note":"kept staged value"}}]',
      );
      await expect(recovered.getByRole("textbox")).toHaveCount(3);
      expect(await stored()).toEqual(expected);
      await expect(page.getByText("No connection", { exact: true })).toBeVisible();
      await recovered.getByRole("button", { name: "Keep local copies", exact: true }).click();
      expect(await secret()).toMatchObject({ ok: true });
      await page
        .getByRole("button", { name: "Connect Recovery toggle fixture", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Run SQL / selection", exact: true }),
      ).toBeEnabled();
      await expect(page.locator(".sql-editor .view-lines")).toContainText(sqlText);
      await expect(page.getByRole("table", { name: "SQL results", exact: true })).toHaveCount(0);
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM "${schema}".writes`)).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (await client.query(`SELECT note FROM "${schema}".kept_records ORDER BY id`)).rows,
      ).toEqual([{ note: "original" }, { note: "neighbour" }]);
    } finally {
      // This is an isolated test profile: do not leave a dirty editor's quit prompt behind.
      if (app && app.process().exitCode === null && app.process().signalCode === null) {
        await app
          .evaluate(({ dialog }) => {
            dialog.showMessageBoxSync = () => 1;
          })
          .catch(() => {});
        await app.close();
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
      await client.end();
      rmSync(directory, { recursive: true, force: true });
    }
  });
