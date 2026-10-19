import { test, expect, _electron as electron } from "@playwright/test";
import { Client } from "pg";
import { createServer, connect as connectSocket, type Socket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";
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
      `DROP SCHEMA IF EXISTS dbapp_save_ui CASCADE;CREATE SCHEMA dbapp_save_ui;CREATE TABLE dbapp_save_ui.records(id int PRIMARY KEY,note text,doc json,derived int GENERATED ALWAYS AS (id+1) STORED);INSERT INTO dbapp_save_ui.records(id,note,doc) VALUES(1,'original','{"n":9007199254740993}'),(2,'neighbour','null');`,
    );
    const directory = mkdtempSync(path.join(tmpdir(), "rowberry-save-"));
    const app = await electron.launch({
      args: [path.resolve("."), `--user-data-dir=${directory}`],
    });
    const page = await app.firstWindow();
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
      await stage(1, "saved");
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Confirm database changes" });
      await expect(preview.getByLabel("Original note")).toHaveText("original");
      await expect(preview.getByLabel("Pending note")).toHaveText("saved");
      expect(
        (await client.query("SELECT note FROM dbapp_save_ui.records WHERE id=1")).rows[0].note,
      ).toBe("original");
      await preview.getByRole("button", { name: "Cancel preview" }).click();
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await preview.getByRole("button", { name: "Confirm save" }).click();
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
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
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
      // SQL NULL differs from the JSON literal null.
      await stage(1, null);
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await preview.getByRole("button", { name: "Confirm save" }).click();
      await expect(grid.getByRole("gridcell").nth(1)).toHaveText("NULL");
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
      await inspector.getByLabel("JSON edit pointer", { exact: true }).fill("/n");
      await inspector.getByLabel("JSON value type", { exact: true }).selectOption("number");
      await inspector.getByLabel("JSON new value", { exact: true }).fill("99999999999999999999");
      await inspector.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(inspector.getByRole("tree")).toContainText("99999999999999999999");
      await inspector.getByRole("button", { name: "Save to database", exact: true }).click();
      await expect(preview).toBeVisible();
      await preview.getByRole("button", { name: "Confirm save" }).click();
      await expect(inspector).not.toContainText("unsaved draft");
      expect(
        (await client.query("SELECT doc::text FROM dbapp_save_ui.records WHERE id=1")).rows[0].doc,
      ).toContain("99999999999999999999");
      const text = inspector.getByRole("textbox", { name: "JSON text editor", exact: true });
      await text.focus();
      await page.keyboard.press("Meta+A");
      await page.keyboard.type('{"invalid":');
      await expect(
        inspector.getByRole("button", { name: "Save to database", exact: true }),
      ).toBeDisabled();
    } finally {
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
  const app = await electron.launch({ args: [path.resolve("."), `--user-data-dir=${directory}`] });
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
  } finally {
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
  const app = await electron.launch({ args: [path.resolve("."), `--user-data-dir=${directory}`] });
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
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await client.end();
    rmSync(directory, { recursive: true, force: true });
  }
});
