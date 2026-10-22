import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { ReplySchema } from "../../src/shared/protocol";
for (const version of [14, 18])
  test(`SQL desktop sessions, selection, cancellation, paging and recovery PostgreSQL ${version}`, async () => {
    const userData = mkdtempSync(path.join(tmpdir(), "rowberry-sql-"));
    let app = await electron.launch({
      executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
      args: [
        ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
        `--user-data-dir=${userData}`,
      ],
    });
    let page = await app.firstWindow();
    const client = new Client({
      host: "localhost",
      port: 55400 + version,
      database: "fixture",
      user: "fixture",
      password: "fixture-only-password",
    });
    await client.connect();
    const initialBackends = new Set(
      (
        await client.query("SELECT pid FROM pg_stat_activity WHERE application_name='dbapp'")
      ).rows.map((row) => row.pid),
    );
    const schema = "sql_desktop_" + crypto.randomUUID().replaceAll("-", "");
    await client.query(
      `CREATE SCHEMA "${schema}"; CREATE TABLE "${schema}".writes(i int); CREATE TABLE "${schema}".documents(id int PRIMARY KEY, label text); INSERT INTO "${schema}".documents VALUES(1, 'Original')`,
    );
    async function request(command: Record<string, unknown>) {
      return ReplySchema.parse(
        await page.evaluate(
          async (command) =>
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
          name: "SQL fixture",
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
      await page.getByRole("button", { name: "Connect SQL fixture", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Search schemas and tables" })).toBeVisible();
      await page.getByRole("button", { name: "New SQL tab", exact: true }).click();
      const runButton = page.getByRole("button", { name: "Run SQL / selection", exact: true });
      await expect(runButton).toBeEnabled();
      await page.getByRole("tab", { name: "SQL 1", exact: true }).click();
      await expect(runButton).toBeVisible();
      await expect(page.getByRole("tab", { name: "SQL 1", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
      await expect(page.locator(".sql-editor .monaco-editor")).toHaveClass(/vs-dark/);
      await page.getByLabel("Appearance", { exact: true }).selectOption("light");
      await expect(page.locator(".sql-editor .monaco-editor")).not.toHaveClass(/vs-dark/);
      const editor = page.getByRole("textbox", { name: "SQL editor" });
      async function text(sql: string) {
        await editor.focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.type(sql);
      }
      await text("SELECT 12345678901234567890.123456789::numeric AS exact, NULL::text AS absent");
      await page.getByRole("button", { name: "Connections", exact: true }).click();
      await page.getByRole("button", { name: "Select SQL fixture", exact: true }).click();
      await expect(page.getByLabel("Host", { exact: true })).toBeDisabled();
      await page.getByRole("tab", { name: /SQL 1/ }).click();
      await expect(editor).toHaveValue(
        "SELECT 12345678901234567890.123456789::numeric AS exact, NULL::text AS absent",
      );
      await runButton.click();
      await expect(page.getByRole("table", { name: "SQL results" })).toContainText(
        "12345678901234567890.123456789",
      );
      await expect(page.getByRole("table", { name: "SQL results" })).toContainText("NULL");
      // Mixed documents retain results and table edits without prompting on a switch.
      await page.getByRole("textbox", { name: "Search schemas and tables" }).fill(schema);
      await page.getByRole("button", { name: `documents ${schema} · table`, exact: true }).click();
      const grid = page.getByRole("grid", { name: "Table rows" });
      await grid.getByRole("gridcell").nth(1).click();
      await page.getByRole("button", { name: "Edit selected cell", exact: true }).click();
      await page.getByRole("textbox", { name: "Cell draft", exact: true }).fill("Retained draft");
      await page
        .getByRole("button", { name: `writes ${schema} · table · read-only`, exact: true })
        .click();
      await page.getByRole("button", { name: `documents ${schema} · table`, exact: true }).click();
      await expect(page.getByRole("tab")).toHaveCount(3);
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveValue(
        "Retained draft",
      );
      await expect(page.getByRole("tab", { name: /^documents/ })).toContainText("•");
      await page.getByRole("tab", { name: /^documents/ }).focus();
      await page.keyboard.press("ArrowLeft");
      await expect(page.getByRole("tab", { name: /^SQL 1/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveValue(
        "Retained draft",
      );
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("button", { name: "Close documents", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Cell draft", exact: true })).toHaveValue(
        "Retained draft",
      );
      await page.getByRole("tab", { name: /^SQL 1/ }).click();
      await expect(page.getByRole("table", { name: "SQL results" })).toContainText(
        "12345678901234567890.123456789",
      );
      // Closing a hidden table must not close or discard the active query.
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Close documents", exact: true }).click();
      await page.getByRole("button", { name: "Close writes", exact: true }).click();
      await expect(page.getByRole("tab")).toHaveCount(1);
      await expect(editor).toHaveValue(
        "SELECT 12345678901234567890.123456789::numeric AS exact, NULL::text AS absent",
      );
      expect((await client.query(`SELECT label FROM "${schema}".documents`)).rows[0].label).toBe(
        "Original",
      );
      await text("SELECT 1; SELECT 2");
      await runButton.click();
      await expect(page.locator(".query-tab output")).toContainText("Run one statement at a time");
      // Select the first statement only; extended-protocol batching is never split.
      await editor.focus();
      for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Shift+ArrowRight");
      for (let i = 0; i < 7; i++) await page.keyboard.press("Shift+ArrowRight");
      await runButton.click();
      await expect(page.locator(".query-tab output")).toContainText("complete");
      await text("SELECT pg_backend_pid()");
      await runButton.click();
      await expect(
        page
          .getByRole("table", { name: "SQL results" })
          .getByRole("columnheader", { name: "pg_backend_pid", exact: false }),
      ).toBeVisible();
      const backendPid = Number(
        await page
          .getByRole("table", { name: "SQL results" })
          .locator("tbody td")
          .nth(1)
          .textContent(),
      );
      await client.query("SELECT pg_terminate_backend($1)", [backendPid]);
      await expect
        .poll(async () =>
          Number(
            (await client.query("SELECT count(*) FROM pg_stat_activity WHERE pid=$1", [backendPid]))
              .rows[0].count,
          ),
        )
        .toBe(0);
      await text("SELECT 424242");
      await runButton.click();
      const reopen = page.getByRole("button", { name: "Reopen session", exact: true });
      await expect(reopen).toBeVisible();
      await expect(page.locator(".query-tab output")).toContainText("Transaction: unknown");
      await expect(editor).toHaveValue("SELECT 424242");
      await reopen.click();
      await expect(page.locator(".query-tab output")).toContainText(
        "Session reopened. Run SQL explicitly. · Transaction: idle",
      );
      await expect(editor).toHaveValue("SELECT 424242");
      await expect(page.getByRole("table", { name: "SQL results" })).toHaveCount(0);
      await runButton.click();
      await expect(page.getByRole("table", { name: "SQL results" })).toContainText("424242");
      await page.getByRole("button", { name: "BEGIN", exact: true }).click();
      await expect(page.locator(".query-tab output")).toContainText("Transaction: active");
      await text("SELECT no_such_column");
      await runButton.click();
      await expect(page.locator(".query-tab output")).toContainText("does not exist");
      await expect(page.locator(".query-tab output")).toContainText("Transaction: aborted");
      await page.getByRole("button", { name: "ROLLBACK", exact: true }).click();
      await expect(page.locator(".query-tab output")).toContainText("Transaction: idle");
      await text("SELECT pg_sleep(20)");
      await runButton.click();
      const cancel = page.getByRole("button", { name: "Cancel query", exact: true });
      await expect(cancel).toBeEnabled();
      await expect(page.getByRole("button", { name: /^Close SQL \d+$/ })).toBeDisabled();
      await cancel.click();
      await expect(page.locator(".query-tab output")).toContainText("cancel");
      await expect(runButton).toBeEnabled();
      await text("SELECT i FROM generate_series(1,1200) i");
      await runButton.click();
      await expect(
        page.getByText("200 rows on this page · read only", { exact: false }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Next result page" }).click();
      await expect(
        page
          .getByRole("table", { name: "SQL results" })
          .locator("tbody tr")
          .first()
          .getByRole("cell")
          .nth(1),
      ).toHaveText("201");
      expect(
        await page.getByRole("table", { name: "SQL results" }).locator("tbody tr").count(),
      ).toBe(200);
      await text("SELECT 999");
      await runButton.click();
      await expect(page.getByRole("alertdialog")).toContainText("commit an implicit mutation");
      await page.getByRole("button", { name: "Keep result" }).click();
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: /^Close SQL \d+$/ }).click();
      await page.getByRole("button", { name: "New SQL tab" }).click();
      await expect(runButton).toBeEnabled();
      await text("SELECT ");
      await page.keyboard.press("Control+Space");
      await expect(page.locator(".suggest-widget.visible")).toContainText(schema);
      await page.keyboard.press("Escape");
      // Explicit SQL-result JSON replacement clears only the confirmed outgoing draft.
      await text(`SELECT '"first"'::json AS first, '"second"'::json AS second`);
      await runButton.click();
      const inspectButtons = page.getByRole("button", { name: "Inspect JSON", exact: true });
      await inspectButtons.first().click();
      const inspector = page.getByRole("region", { name: "JSON inspector", exact: true });
      await inspector.getByRole("button", { name: "Edit JSON", exact: true }).click();
      await inspector.getByLabel("JSON new value", { exact: true }).fill("retained until discard");
      await inspector.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(inspector).toHaveAttribute("data-dirty", "true");
      async function jsonRecovery() {
        const reply = await request({ kind: "workspace.load" });
        if (!reply.ok || reply.kind !== "workspace.load") throw new Error("Workspace unavailable");
        return reply.data.drafts.filter((draft) => draft.kind === "json");
      }
      await expect
        .poll(async () => (await jsonRecovery()).map((draft) => draft.text))
        .toEqual(['"retained until discard"']);
      page.once("dialog", (dialog) => dialog.dismiss());
      await inspectButtons.nth(1).focus();
      await page.keyboard.press("Enter");
      await expect(inspector).toHaveAttribute("data-dirty", "true");
      // Let recovery writes settle before checking durable cancellation retention.
      await page.waitForTimeout(400);
      expect((await jsonRecovery()).map((draft) => draft.text)).toEqual([
        '"retained until discard"',
      ]);
      page.once("dialog", (dialog) => dialog.accept());
      await inspectButtons.nth(1).focus();
      await page.keyboard.press("Enter");
      await expect(inspector).toHaveAttribute("data-dirty", "false");
      await expect(inspector.getByRole("tree")).toContainText("second");
      await expect.poll(async () => (await jsonRecovery()).length).toBe(0);
      await inspector.getByRole("button", { name: "Close JSON", exact: true }).click();
      await text("SELECT 777");
      await page.getByRole("textbox", { name: "Saved query name" }).fill("Never auto execute");
      await page.getByRole("button", { name: "Save query", exact: true }).click();
      await expect(page.locator(".query-tab output")).toContainText("Query saved");
      // Actual bridge/worker ownership, tab isolation and cap, beyond rendered state.
      const sessionReply = await request({ kind: "connections.connect", id });
      if (!sessionReply.ok || sessionReply.kind !== "connections.connect")
        throw new Error("No session");
      const owner = {
        sessionId: sessionReply.data.sessionId,
        generation: sessionReply.data.generation,
      };
      await expect(runButton).toBeEnabled();
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: /^Close SQL \d+$/ }).click();
      const a = crypto.randomUUID(),
        b = crypto.randomUUID();
      for (const tabId of [a, b])
        expect((await request({ kind: "queries.openTab", ...owner, tabId })).ok).toBe(true);
      const run = async (tabId: string, sql: string) => {
        const started = await request({ kind: "queries.start", ...owner, tabId, sql });
        if (!started.ok || started.kind !== "queries.start") throw new Error("start failed");
        return request({
          kind: "queries.fetch",
          ...owner,
          tabId,
          queryId: started.data.queryId,
          pageSize: 200,
        });
      };
      await run(a, "BEGIN");
      await run(a, `INSERT INTO "${schema}".writes VALUES(1)`);
      expect((await client.query(`SELECT count(*) FROM "${schema}".writes`)).rows[0].count).toBe(
        "0",
      );
      const isolated = await run(b, "SELECT 3");
      expect(isolated.ok && isolated.kind === "queries.fetch" && isolated.data.transaction).toBe(
        "idle",
      );
      expect((await request({ kind: "queries.closeTab", ...owner, tabId: a })).ok).toBe(true);
      expect((await client.query(`SELECT count(*) FROM "${schema}".writes`)).rows[0].count).toBe(
        "0",
      );
      expect(
        (
          await request({
            kind: "queries.openTab",
            ...owner,
            generation: owner.generation + 1,
            tabId: crypto.randomUUID(),
          })
        ).ok,
      ).toBe(false);
      for (let i = 0; i < 15; i++)
        expect(
          (await request({ kind: "queries.openTab", ...owner, tabId: crypto.randomUUID() })).ok,
        ).toBe(true);
      expect(
        (await request({ kind: "queries.openTab", ...owner, tabId: crypto.randomUUID() })).ok,
      ).toBe(false);
      const started = await request({
        kind: "queries.start",
        ...owner,
        tabId: b,
        sql: "SELECT pg_sleep(20)",
      });
      if (!started.ok || started.kind !== "queries.start") throw new Error("start failed");
      const late = request({
        kind: "queries.fetch",
        ...owner,
        tabId: b,
        queryId: started.data.queryId,
      });
      const switched = await request({ kind: "connections.connect", id });
      expect((await late).ok).toBe(false);
      if (!switched.ok || switched.kind !== "connections.connect") throw new Error("Switch failed");
      const closingOwner = {
        sessionId: switched.data.sessionId,
        generation: switched.data.generation,
        tabId: crypto.randomUUID(),
      };
      expect((await request({ kind: "queries.openTab", ...closingOwner })).ok).toBe(true);
      expect(
        (await request({ kind: "queries.start", ...closingOwner, sql: "SELECT pg_sleep(20)" })).ok,
      ).toBe(true);
      // App quit must drain cancellation, not just kill a socket while SQL runs.
      // Test teardown explicitly discards live editors; user close remains guarded.
      await app.evaluate(({ app, BrowserWindow }) => {
        BrowserWindow.getAllWindows().forEach((window) => window.destroy());
        // Repeated quit requests must not bypass in-flight database cancellation.
        app.quit();
        app.quit();
      });
      await app.close();
      app = await electron.launch({
        executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
        args: [
          ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
          `--user-data-dir=${userData}`,
        ],
      });
      page = await app.firstWindow();
      expect(await jsonRecovery()).toEqual([]);
      await expect(page.getByLabel("Recovered json draft")).toHaveCount(0);
      const saved = await request({ kind: "queries.saved.list", offset: 0 });
      expect(
        saved.ok &&
          saved.kind === "queries.saved.list" &&
          saved.data.items.some((item) => item.name === "Never auto execute"),
      ).toBe(true);
      if (!saved.ok || saved.kind !== "queries.saved.list")
        throw new Error("Saved query list unavailable");
      const item = saved.data.items.find((item) => item.name === "Never auto execute");
      if (!item) throw new Error("Saved query missing");
      const restored = await request({ kind: "queries.saved.get", id: item.id });
      expect(restored.ok && restored.kind === "queries.saved.get" && restored.data.sql).toBe(
        "SELECT 777",
      );
      await expect
        .poll(
          async () =>
            (
              await client.query("SELECT pid FROM pg_stat_activity WHERE application_name='dbapp'")
            ).rows.filter((row) => !initialBackends.has(row.pid)).length,
        )
        .toBe(0);
      const metrics = await app.evaluate(({ app }) =>
        app.getAppMetrics().map((metric) => metric.name),
      );
      expect(metrics).not.toContain("Database session");
    } finally {
      // Test teardown explicitly discards live editors; user close remains guarded.
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      );
      await app.close();
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
      rmSync(userData, { recursive: true, force: true });
    }
  });
