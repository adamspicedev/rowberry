import { test, expect, _electron as electron } from "@playwright/test";
import { Client } from "pg";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConnectionProfileSchema } from "../../src/shared/protocol";
test("live schema navigation, typed virtual grid, filtering, sorting, paging and keyboard inspection", async () => {
  const client = new Client({
    host: "localhost",
    port: 55418,
    database: "fixture",
    user: "fixture",
    password: "fixture-only-password",
  });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS dbapp_desktop_browse CASCADE; CREATE SCHEMA dbapp_desktop_browse;
 CREATE TABLE dbapp_desktop_browse.records (id integer PRIMARY KEY, amount numeric, doc json);
 INSERT INTO dbapp_desktop_browse.records SELECT i,12345678901234567890.123456789,'{"n":9007199254740993,"n":2}'::json FROM generate_series(1,1200) i;
 UPDATE dbapp_desktop_browse.records SET doc=('"'||repeat('x',1048576)||'"')::json WHERE id=1;
 UPDATE dbapp_desktop_browse.records SET doc=('"'||repeat('x',33554432)||'"')::json WHERE id=2;
 CREATE TABLE dbapp_desktop_browse.empty (id integer PRIMARY KEY);
 CREATE TABLE dbapp_desktop_browse.keyless (v text); INSERT INTO dbapp_desktop_browse.keyless VALUES ('read only');`);
  const userData = mkdtempSync(path.join(tmpdir(), "dbapp-browse-ui-"));
  const application = await electron.launch({
    args: [path.resolve("."), `--user-data-dir=${userData}`],
  });
  try {
    const page = await application.firstWindow();
    const profile = ConnectionProfileSchema.parse({
      id: crypto.randomUUID(),
      name: "Browse fixture",
      host: "localhost",
      port: 55418,
      user: "fixture",
      database: "fixture",
      tls: { kind: "disable", acknowledged: true },
      environmentColor: "#123456",
    });
    await page.evaluate(async (profile) => {
      await Reflect.apply(window.dbapp.request, window.dbapp, [
        { kind: "connections.save", requestId: "save", profile },
      ]);
      await Reflect.apply(window.dbapp.request, window.dbapp, [
        {
          kind: "connections.submitSecret",
          requestId: "secret",
          id: profile.id,
          secret: "fixture-only-password",
          persist: false,
        },
      ]);
    }, profile);
    await page.reload();
    await page.getByRole("button", { name: "Connect Browse fixture", exact: true }).click();
    const search = page.getByRole("textbox", { name: "Search schemas and tables" });
    await search.fill("dbapp_desktop_browse");
    const records = page.getByRole("button", { name: "records dbapp_desktop_browse · table" });
    await expect(records).toBeVisible();
    await records.focus();
    await page.keyboard.press("Enter");
    const grid = page.getByRole("grid", { name: "Table rows" });
    await expect(grid).toBeVisible();
    await expect(
      page.getByText("12345678901234567890.123456789", { exact: true }).first(),
    ).toBeVisible();
    expect(await grid.getByRole("row").count()).toBeLessThan(40); // a bounded slice of the 200-row page
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("200 rows · page 2", { exact: true })).toBeVisible();
    await expect(grid.getByRole("gridcell").first()).toHaveText("201");
    await page.getByRole("button", { name: "Sort by id", exact: true }).click();
    await expect(grid.getByRole("gridcell").first()).toHaveText("1");
    await page.getByRole("button", { name: "Sort by id", exact: true }).click();
    await expect(grid.getByRole("gridcell").first()).toHaveText("1200");
    await page.getByLabel("Filter column", { exact: true }).selectOption("id");
    await page.getByLabel("Filter value", { exact: true }).fill("42");
    await page.getByRole("button", { name: "Apply filter", exact: true }).click();
    await expect(page.getByText("1 rows · page 1", { exact: true })).toBeVisible();
    await grid.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Raw JSON", exact: true })).toHaveValue(
      '{"n":9007199254740993,"n":2}',
    );
    await page.screenshot({ path: "/tmp/dbapp-task4-browse.png" });
    await page.getByRole("button", { name: "Close inspection" }).click();
    await page.getByLabel("Filter value", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Apply filter", exact: true }).click();
    await expect(grid.getByRole("gridcell").first()).toHaveText("1");
    await grid.getByRole("gridcell").nth(2).dblclick();
    await expect
      .poll(
        async () =>
          (await page.getByRole("textbox", { name: "Raw JSON", exact: true }).inputValue()).length,
      )
      .toBe(1048578);
    await page.getByRole("button", { name: "Close inspection" }).click();
    await page.getByLabel("Filter value", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Apply filter", exact: true }).click();
    await expect(grid.getByRole("gridcell").first()).toHaveText("2");
    await grid.getByRole("gridcell").nth(2).dblclick();
    await expect(
      page.getByText(
        "Full JSON unavailable, changed, or exceeds the 32 MiB limit. No partial document was opened.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Raw JSON", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close inspection" }).click();
    await search.fill("dbapp_desktop_browse.empty");
    await page.getByRole("button", { name: "empty dbapp_desktop_browse · table" }).click();
    await expect(page.getByText("No rows found.", { exact: true })).toBeVisible();
    await search.fill("dbapp_desktop_browse.keyless");
    await page
      .getByRole("button", { name: "keyless dbapp_desktop_browse · table · read-only" })
      .click();
    await expect(
      page.getByText(
        "No suitable unique key. Rows are read-only; pages can shift when data changes.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(grid.getByRole("gridcell").first()).toHaveText("read only");
  } finally {
    await application.close();
    rmSync(userData, { recursive: true, force: true });
    await client.query("DROP SCHEMA IF EXISTS dbapp_desktop_browse CASCADE");
    await client.end();
  }
});
