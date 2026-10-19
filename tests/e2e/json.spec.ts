import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";
for (const version of [14, 18])
  test(`JSON draft worker, collapsed search, precise edits, invalid text and close PG${version}`, async () => {
    test.setTimeout(60000);
    const directory = mkdtempSync(path.join(tmpdir(), "rowberry-json-"));
    const app = await electron.launch({
      args: [path.resolve("."), `--user-data-dir=${directory}`],
    });
    const page = await app.firstWindow();
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
          name: "JSON fixture",
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
      await page.getByRole("button", { name: "Connect JSON fixture", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Search schemas and tables" })).toBeVisible();
      await page.getByRole("button", { name: "SQL workspace", exact: true }).click();
      const sql = page.getByRole("textbox", { name: "SQL editor" });
      await sql.focus();
      await page.keyboard.type(
        `SELECT '{"hidden":{"a/b~c":"needle"},"items":[1,2],"exact":12345678901234567890,"empty":null}'::json AS doc, NULL::json AS absent`,
      );
      await page.getByRole("button", { name: "Run SQL / selection", exact: true }).click();
      await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
      const panel = page.getByRole("region", { name: "JSON inspector", exact: true });
      await expect(panel.getByRole("tree")).toBeVisible();
      await expect(panel).toContainText("copy-only draft");
      await expect(panel.getByRole("button", { name: "Save to database" })).toBeDisabled();
      await expect(page.getByRole("table", { name: "SQL results" })).toContainText("SQL NULL");
      await panel.getByRole("textbox", { name: "Search JSON keys and values" }).fill("needle");
      await panel.getByRole("button", { name: "Search JSON", exact: true }).click();
      await expect(panel).toContainText("1 matches");
      await panel.getByRole("button", { name: "Next match" }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("a/b~c");
      await panel.getByRole("button", { name: "Expand hidden", exact: true }).click();
      await expect(panel.getByRole("tree")).not.toContainText("a/b~c");
      await panel.getByRole("button", { name: "Next match", exact: true }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("a/b~c");

      await expect(panel.getByLabel("JSON edit pointer", { exact: true })).toHaveValue(
        "/hidden/a~1b~0c",
      );
      await panel.getByRole("treeitem", { selected: true }).click();
      await panel.getByRole("textbox", { name: "JSON text editor" }).focus();
      await page.keyboard.press("Meta+C");
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('"needle"');
      await panel.getByRole("button", { name: "Copy JSON pointer" }).click();
      await expect(panel).toContainText("Copied");
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("/hidden/a~1b~0c");
      await panel.getByRole("textbox", { name: "JSON edit pointer" }).fill("/exact");
      await panel.getByLabel("JSON value type", { exact: true }).selectOption("number");
      await panel.getByLabel("JSON new value", { exact: true }).fill("99999999999999999999");
      await panel.getByRole("button", { name: "Set value", exact: true }).click();
      await expect(panel.getByRole("tree")).toContainText("99999999999999999999");
      await panel.getByRole("button", { name: "Undo JSON" }).click();
      await expect(panel.getByRole("tree")).toContainText("12345678901234567890");
      await panel.getByRole("button", { name: "Redo JSON" }).click();
      await expect(panel.getByRole("tree")).toContainText("99999999999999999999");
      await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/items/0");
      await panel.getByRole("button", { name: "Reveal pointer", exact: true }).click();
      await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/items/1");
      await panel.getByRole("button", { name: "Move selected to pointer", exact: true }).click();
      await expect(panel.locator(".view-lines")).toContainText('"items":[2,1]');
      await panel.getByRole("button", { name: "Undo JSON" }).click();
      await expect(panel.getByRole("button", { name: "Redo JSON" })).toBeEnabled();
      await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/added");
      await panel.getByLabel("JSON value type", { exact: true }).selectOption("null");
      await panel.getByRole("button", { name: "Add value", exact: true }).click();
      await expect(panel.getByRole("tree")).toContainText("addednull");
      await panel.getByRole("button", { name: "Remove value", exact: true }).click();
      await expect(panel.getByRole("tree")).not.toContainText("added");
      const editor = panel.getByRole("textbox", { name: "JSON text editor" });
      await editor.focus();
      await page.keyboard.press("Meta+A");
      await page.keyboard.type('{"invalid":');
      await expect(panel.getByRole("alert")).toBeVisible();
      await expect(panel.locator(".view-lines")).toContainText('{"invalid":');
      await panel.getByLabel("JSON view", { exact: true }).selectOption("tree");
      await panel.getByLabel("JSON view", { exact: true }).selectOption("split");
      await expect(panel.getByRole("button", { name: "Set value", exact: true })).toBeDisabled();
      await editor.focus();
      await page.keyboard.press("Meta+A");
      await page.keyboard.type('{"duplicate":1,"duplicate":2}');
      await expect(panel).toContainText("Duplicate keys");
      await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
      await expect(panel.getByRole("alertdialog")).toBeVisible();
      await panel.getByRole("button", { name: "Keep editing JSON" }).click();
      await expect(panel.locator(".view-lines")).toContainText('{"duplicate":1,"duplicate":2}');
      await panel.getByLabel("JSON view", { exact: true }).selectOption("text");
      await panel.getByLabel("JSON view", { exact: true }).selectOption("split");
      await expect(panel.locator(".view-lines")).toContainText('{"duplicate":1,"duplicate":2}');
      await panel.getByRole("button", { name: "Expand panel", exact: true }).click();
      await page.screenshot({ path: "/tmp/rowberry-json-task7.png" });
      await editor.focus();
      await page.keyboard.press("Meta+A");
      await page.keyboard.type('{"fromText":true}');
      await expect(panel.getByRole("tree")).toContainText("fromTexttrue");
      await panel.getByRole("treeitem").first().click();
      await panel.getByRole("tree").focus();
      await page.keyboard.press("ArrowDown");
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("fromText");
      await panel.getByRole("button", { name: "Undo JSON" }).click();
      await expect(panel).toContainText("Duplicate keys");

      await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
      await panel.getByRole("button", { name: "Discard and close JSON" }).click();
      await expect(panel).toHaveCount(0);
      await sql.focus();
      await page.keyboard.press("Meta+A");
      await page.keyboard.type(
        "SELECT json_build_object('items', json_agg(repeat('x',110))) FROM generate_series(1,100000)",
      );
      await page.getByRole("button", { name: "Run SQL / selection", exact: true }).click();
      await expect(page.locator(".query-tab output")).toContainText("complete");
      await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
      await expect(panel.getByRole("button", { name: "Expand items", exact: true })).toBeVisible({
        timeout: 15000,
      });
      const expandMs = await panel
        .getByRole("button", { name: "Expand items", exact: true })
        .evaluate(async (element) => {
          const start = performance.now();
          element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return performance.now() - start;
        });
      expect(await panel.getByRole("treeitem").count()).toBeLessThan(40);
      const selectMs = await panel
        .getByRole("treeitem")
        .nth(2)
        .evaluate(async (element) => {
          const start = performance.now();
          element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return performance.now() - start;
        });
      // Measurement-only: the 100 ms target is evaluated on the documented reference machine.
      // General CI runners do not enforce a machine-dependent wall-clock threshold.
      console.log(
        "Actual Chromium large JSON UI (measurement-only, target 100 ms)",
        JSON.stringify({ expandMs, selectMs }),
      );
      await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/items/99999");
      await panel.getByRole("button", { name: "Reveal pointer", exact: true }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("99999");
      await panel.getByRole("tree").evaluate((element) => element.scrollTo({ top: 0 }));
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveCount(0);
      await panel.getByRole("button", { name: "Reveal pointer", exact: true }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("99999");

      await page.screenshot({ path: "/tmp/rowberry-json-large-task7.png" });
      await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
      await page.screenshot({ path: "/tmp/rowberry-json-dark-task7.png" });
      await page.getByLabel("Appearance", { exact: true }).selectOption("system");
    } finally {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("Chromium JSON worker large parse, search, cancellation and stale identity", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-json-bench-"));
  const app = await electron.launch({ args: [path.resolve("."), `--user-data-dir=${directory}`] });
  try {
    const page = await app.firstWindow();
    const asset = readdirSync("dist/renderer/assets").find(
      (name) => name.startsWith("worker-") && name.endsWith(".js"),
    );
    if (!asset) throw new Error("Missing built JSON worker");
    const metrics = await page.evaluate(async (asset) => {
      const worker = new Worker(new URL(`assets/${asset}`, location.href), { type: "module" });
      const events: {
        requestId: string;
        kind: string;
        revision: number;
        document?: { editable: boolean; text: string; diagnostics: { kind: string }[] };
        matches?: unknown[];
      }[] = [];
      worker.onmessage = (event) => events.push(event.data);
      async function wait(requestId: string, kind: string) {
        const start = performance.now();
        while (!events.some((event) => event.requestId === requestId && event.kind === kind)) {
          if (performance.now() - start > 15000)
            throw new Error(
              `Timed out ${requestId}/${kind}: ${events.slice(-3).map((event) => event.kind)}`,
            );
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
      const source =
        "[" +
        Array.from({ length: 100000 }, (_, index) =>
          JSON.stringify(`${index}-${"x".repeat(110)}`),
        ).join(",") +
        "]";
      const start = performance.now();
      worker.postMessage({
        kind: "load",
        documentId: "large",
        revision: 0,
        requestId: "load",
        text: source,
      });
      await wait("load", "document");
      const parseMs = performance.now() - start;
      const searchStart = performance.now();
      worker.postMessage({
        kind: "search",
        documentId: "large",
        revision: 0,
        requestId: "find",
        query: "99999-",
      });
      await wait("find", "done");
      const searchMs = performance.now() - searchStart;
      worker.postMessage({
        kind: "search",
        documentId: "large",
        revision: 0,
        requestId: "cancel-search",
        query: "x",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const cancelStart = performance.now();
      worker.postMessage({
        kind: "cancel",
        documentId: "large",
        revision: 0,
        requestId: "cancel",
        targetRequestId: "cancel-search",
      });
      await wait("cancel-search", "cancelled");
      const cancelSearchMs = performance.now() - cancelStart;
      worker.postMessage({
        kind: "load",
        documentId: "cancel-parse",
        revision: 0,
        requestId: "parse",
        text: source,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const parseCancelStart = performance.now();
      worker.postMessage({
        kind: "cancel",
        documentId: "cancel-parse",
        revision: 0,
        requestId: "cancel-parse-job",
        targetRequestId: "parse",
      });
      await wait("parse", "cancelled");
      const cancelParseMs = performance.now() - parseCancelStart;
      worker.postMessage({
        kind: "load",
        documentId: "large",
        revision: 1,
        requestId: "new",
        text: "null",
      });
      await wait("new", "document");
      worker.postMessage({
        kind: "search",
        documentId: "large",
        revision: 0,
        requestId: "stale",
        query: "x",
      });
      await wait("stale", "error");
      worker.postMessage({
        kind: "load",
        documentId: "deep",
        revision: 0,
        requestId: "deep",
        text: "[".repeat(100) + '"deep😀"' + "]".repeat(100),
      });
      await wait("deep", "document");
      if (!events.find((event) => event.requestId === "deep")?.document?.editable)
        throw new Error("100-level JSON rejected");
      const oversized = '"' + "x".repeat(33 * 1024 * 1024) + '"';
      worker.postMessage({
        kind: "load",
        documentId: "limit",
        revision: 0,
        requestId: "limit",
        text: oversized,
      });
      await wait("limit", "document");
      const rejected = events.find((event) => event.requestId === "limit")?.document;
      if (
        !rejected ||
        rejected.editable ||
        rejected.text.length !== oversized.length ||
        rejected.diagnostics[0]?.kind !== "limit"
      )
        throw new Error("Oversized JSON was truncated or editable");
      const matches = events
        .filter((event) => event.requestId === "find")
        .flatMap((event) => event.matches ?? []).length;
      const editable = events.find((event) => event.requestId === "load")?.document?.editable;
      worker.postMessage({
        kind: "release",
        documentId: "large",
        revision: 1,
        requestId: "release",
      });
      await wait("release", "released");
      worker.terminate();
      return {
        bytes: source.length,
        scalars: 100000,
        parseMs,
        searchMs,
        cancelSearchMs,
        cancelParseMs,
        matches,
        editable,
      };
    }, asset);
    console.log("Actual Chromium worker", JSON.stringify(metrics));
    expect(metrics.bytes).toBeGreaterThan(10 * 1024 * 1024);
    expect(metrics.editable).toBe(true);
    expect(metrics.matches).toBe(1);
    expect(metrics.searchMs).toBeLessThan(2000);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
