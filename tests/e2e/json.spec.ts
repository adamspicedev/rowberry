import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReplySchema } from "../../src/shared/protocol";
for (const version of [14, 18])
  test(`JSON draft worker, collapsed search, precise edits, invalid text and close PG${version}`, async () => {
    test.setTimeout(60000);
    const qualifyProcessMemory = process.env.DBAPP_PROCESS_MEMORY_QUALIFICATION === "1";
    if (qualifyProcessMemory && process.env.DBAPP_MEMORY_QUALIFICATION === "1")
      throw new Error("Run process-memory qualification separately from forced-GC qualification");
    const directory = mkdtempSync(path.join(tmpdir(), "rowberry-json-"));
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
      await page.getByRole("button", { name: "New SQL tab", exact: true }).click();
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
      const itemsRow = panel.getByRole("treeitem", { name: "items: array, 2 items", exact: true });
      await expect(itemsRow).toBeVisible();
      await itemsRow.click();
      await page.keyboard.press("ArrowRight");
      await expect(itemsRow).toHaveAttribute("aria-expanded", "true");
      await expect(panel.getByRole("status").filter({ hasText: /^items expanded$/ })).toHaveCount(
        1,
      );
      await page.keyboard.press("ArrowLeft");
      await expect(itemsRow).toHaveAttribute("aria-expanded", "false");
      await expect(panel.getByRole("status").filter({ hasText: /^items collapsed$/ })).toHaveCount(
        1,
      );
      const exactRow = panel.getByRole("treeitem", {
        name: "exact: 12345678901234567890",
        exact: true,
      });
      await expect(exactRow).toBeVisible();
      await expect(exactRow.getByRole("button")).toHaveCount(0);
      await expect(exactRow).not.toHaveAttribute("aria-expanded");

      await panel.getByRole("button", { name: "Edit JSON", exact: true }).click();
      await expect(panel.getByRole("button", { name: "Save to database" })).toBeDisabled();
      await expect(page.getByRole("table", { name: "SQL results" })).toContainText("SQL NULL");
      await panel.getByRole("textbox", { name: "Search JSON keys and values" }).fill("needle");
      await panel.getByRole("textbox", { name: "Search JSON keys and values" }).press("Enter");
      await expect(panel).toContainText("1 matches");
      await panel.getByRole("button", { name: "Next match" }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("a/b~c");
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveAccessibleName(
        "a/b~c: needle",
      );
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveAttribute(
        "aria-setsize",
        "1",
      );
      await panel.getByRole("button", { name: "Collapse hidden", exact: true }).click();
      await expect(panel.getByRole("tree")).not.toContainText("a/b~c");
      await panel.getByRole("button", { name: "Next match", exact: true }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("a/b~c");

      await panel.getByRole("textbox", { name: "Search JSON keys and values" }).fill("");
      await expect(panel.getByLabel("JSON edit pointer", { exact: true })).toHaveValue(
        "/hidden/a~1b~0c",
      );
      await panel.getByRole("treeitem", { selected: true }).click();
      await panel.getByRole("textbox", { name: "JSON text editor" }).focus();
      await page.keyboard.press("ControlOrMeta+C");
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('"needle"');
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByRole("button", { name: "Copy JSON pointer" }).click();
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
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
      await expect(panel.getByRole("tree")).toContainText('"added":null');
      await panel.getByRole("button", { name: "Remove value", exact: true }).click();
      await expect(panel.getByRole("tree")).not.toContainText("added");
      const editor = panel.getByRole("textbox", { name: "JSON text editor" });
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type('{"invalid":');
      await expect(panel.getByRole("alert")).toBeVisible();
      await expect(panel.locator(".view-lines")).toContainText('{"invalid":');
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByLabel("JSON view", { exact: true }).selectOption("tree");
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByLabel("JSON view", { exact: true }).selectOption("split");
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await expect(panel.getByRole("button", { name: "Set value", exact: true })).toBeDisabled();
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type('{"duplicate":1,"duplicate":2}');
      await expect(panel).toContainText("Duplicate keys");
      await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
      await expect(panel.getByRole("alertdialog")).toBeVisible();
      await panel.getByRole("button", { name: "Keep editing JSON" }).click();
      await expect(panel.locator(".view-lines")).toContainText('{"duplicate":1,"duplicate":2}');
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByLabel("JSON view", { exact: true }).selectOption("text");
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByLabel("JSON view", { exact: true }).selectOption("split");
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await expect(panel.locator(".view-lines")).toContainText('{"duplicate":1,"duplicate":2}');
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await panel.getByRole("button", { name: "Expand panel", exact: true }).click();
      await panel.getByLabel("JSON viewer actions", { exact: true }).click();
      await page.screenshot({ path: "/tmp/rowberry-json-task7.png" });
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type('{"fromText":true}');
      await expect(panel.getByRole("tree")).toContainText('"fromText":true');
      await panel.getByRole("treeitem").first().click();
      await expect(panel.getByRole("tree")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("fromText");
      await panel.getByRole("button", { name: "Undo JSON" }).click();
      await expect(panel).toContainText("Duplicate keys");

      await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
      await panel.getByRole("button", { name: "Discard and close JSON" }).click();
      await expect(panel).toHaveCount(0);
      await sql.focus();
      await page.keyboard.press("ControlOrMeta+A");
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
      // Opt-in local budgets are evaluated on the documented reference machine.
      // General CI runners do not enforce a machine-dependent wall-clock threshold.
      console.log(
        "Actual Chromium large JSON UI (local target 100 ms)",
        JSON.stringify({ expandMs, selectMs }),
      );
      await test.info().attach("json-ui-performance", {
        body: JSON.stringify({ expandMs, selectMs }),
        contentType: "application/json",
      });
      if (process.env.DBAPP_PERFORMANCE_BUDGETS === "1") {
        expect(expandMs).toBeLessThan(100);
        expect(selectMs).toBeLessThan(100);
      }
      await panel.getByRole("button", { name: "Edit JSON", exact: true }).click();
      await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/items/99999");
      await panel.getByRole("button", { name: "Reveal pointer", exact: true }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("99999");
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveAttribute(
        "aria-posinset",
        "100000",
      );
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveAttribute(
        "aria-setsize",
        "100000",
      );
      await panel.getByRole("tree").evaluate((element) => element.scrollTo({ top: 0 }));
      await expect(panel.getByRole("treeitem", { selected: true })).toHaveCount(1);
      const tree = panel.getByRole("tree");
      const selectedItem = panel.getByRole("treeitem", { selected: true });
      await expect(tree).toHaveAttribute(
        "aria-activedescendant",
        (await selectedItem.getAttribute("id")) as string,
      );
      expect(await panel.getByRole("treeitem").count()).toBeLessThan(40);
      await tree.focus();
      await page.keyboard.press("Home");
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("$");
      await page.keyboard.press("ArrowRight");
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("items");
      await page.keyboard.press("End");
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("99999");
      await page.keyboard.press("ArrowLeft");
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("items");
      await panel.getByRole("button", { name: "Collapse items", exact: true }).click();
      await expect(tree).toBeFocused();
      await expect(selectedItem).toContainText("items");
      await expect(panel.getByRole("button", { name: "Expand items", exact: true })).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(selectedItem).toHaveAttribute("aria-posinset", "1");
      await expect(selectedItem).toHaveAttribute("aria-setsize", "100000");
      await panel.getByLabel("JSON edit pointer", { exact: true }).fill("/items/99999");
      await panel.getByRole("button", { name: "Reveal pointer", exact: true }).click();
      await expect(panel.getByRole("treeitem", { selected: true })).toContainText("99999");

      await page.screenshot({ path: "/tmp/rowberry-json-large-task7.png" });
      await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
      await page.screenshot({ path: "/tmp/rowberry-json-dark-task7.png" });
      await page.getByLabel("Appearance", { exact: true }).selectOption("system");
      if (process.env.DBAPP_MEMORY_QUALIFICATION === "1") {
        const soakMinutes = Number(process.env.DBAPP_MEMORY_SOAK_MINUTES ?? 0);
        if (!Number.isInteger(soakMinutes) || soakMinutes < 0 || soakMinutes > 120)
          throw new Error("DBAPP_MEMORY_SOAK_MINUTES must be an integer from 0 to 120");
        const soakMs = soakMinutes * 60_000;
        test.setTimeout(120000 + soakMs);
        const cdp = await page.context().newCDPSession(page);
        const samples: {
          cycle: number;
          elapsedMs: number;
          usedHeapBytes: number;
          nodes: number;
        }[] = [];
        try {
          await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
          await expect(panel).toHaveCount(0);
          // Always measure ten cycles; opt-in soak runs continue for the full duration.
          const started = performance.now();
          for (let cycle = 0; cycle <= 10 || performance.now() - started < soakMs; cycle++) {
            await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
            await panel.getByRole("button", { name: "Expand items", exact: true }).click();
            await expect(panel.getByRole("treeitem").nth(2)).toBeVisible();
            expect(
              page.workers().filter((worker) => /\/worker-[^/]+\.js/.test(worker.url())),
            ).toHaveLength(1);
            await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
            await expect(panel).toHaveCount(0);
            await expect
              .poll(
                () =>
                  page.workers().filter((worker) => /\/worker-[^/]+\.js/.test(worker.url())).length,
              )
              .toBe(0);
            await cdp.send("HeapProfiler.collectGarbage");
            const heap = await cdp.send("Runtime.getHeapUsage");
            const dom = await cdp.send("Memory.getDOMCounters");
            samples.push({
              cycle,
              elapsedMs: performance.now() - started,
              usedHeapBytes: heap.usedSize,
              nodes: dom.nodes,
            });
            const baseline = samples[0]!;
            expect(heap.usedSize - baseline.usedHeapBytes).toBeLessThan(16 * 1024 * 1024);
            expect(dom.nodes - baseline.nodes).toBeLessThan(100);
            if (soakMs && cycle % 25 === 0)
              console.log("JSON soak progress", JSON.stringify(samples.at(-1)));
          }

          console.log(
            "JSON retained renderer heap after GC",
            JSON.stringify(
              soakMs
                ? { samples: samples.length, first: samples[0], last: samples.at(-1) }
                : samples,
            ),
          );
        } finally {
          await test.info().attach("json-retained-memory", {
            body: JSON.stringify(samples),
            contentType: "application/json",
          });
          await cdp.detach();
        }
      }
      if (qualifyProcessMemory) {
        test.setTimeout(120000);
        type ProcessSample = {
          cycle: number;
          phase: "baseline" | "expanded" | "closed";
          elapsedMs: number;
          processes: {
            pid: number;
            creationTime: number;
            type: string;
            workingSetKiB: number;
            peakWorkingSetKiB: number;
          }[];
          totalWorkingSetKiB: number;
        };
        const samples: ProcessSample[] = [];
        const started = performance.now();
        // A provisional reference-machine regression ceiling, not a minimum RAM requirement.
        const budgetKiB = 1536 * 1024;
        const sample = async (cycle: number, phase: ProcessSample["phase"]) => {
          const processes = await app.evaluate(({ app }) =>
            app.getAppMetrics().map((metric) => ({
              pid: metric.pid,
              creationTime: metric.creationTime,
              type: metric.type,
              workingSetKiB: metric.memory.workingSetSize,
              peakWorkingSetKiB: metric.memory.peakWorkingSetSize,
            })),
          );
          const totalWorkingSetKiB = processes.reduce((sum, item) => sum + item.workingSetKiB, 0);
          samples.push({
            cycle,
            phase,
            elapsedMs: performance.now() - started,
            processes,
            totalWorkingSetKiB,
          });
          // Missing metrics must fail rather than falsely passing a zero-memory budget.
          for (const type of ["Browser", "Tab", "Utility"])
            expect(processes.some((item) => item.type === type && item.workingSetKiB > 0)).toBe(
              true,
            );
          for (const item of processes) {
            expect(Number.isFinite(item.workingSetKiB)).toBe(true);
            expect(item.workingSetKiB).toBeGreaterThanOrEqual(0);
          }
          if (process.env.DBAPP_PERFORMANCE_BUDGETS === "1")
            expect(totalWorkingSetKiB).toBeLessThan(budgetKiB);
        };
        try {
          await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
          await expect(panel).toHaveCount(0);
          await sample(0, "baseline");
          for (let cycle = 1; cycle <= 30; cycle++) {
            await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
            await panel.getByRole("button", { name: "Expand items", exact: true }).click();
            await expect(panel.getByRole("treeitem").nth(2)).toBeVisible();
            expect(
              page.workers().filter((worker) => /\/worker-[^/]+\.js/.test(worker.url())),
            ).toHaveLength(1);
            await sample(cycle, "expanded");
            await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
            await expect(panel).toHaveCount(0);
            await expect
              .poll(
                () =>
                  page.workers().filter((worker) => /\/worker-[^/]+\.js/.test(worker.url())).length,
              )
              .toBe(0);
            await sample(cycle, "closed");
          }
        } finally {
          await test.info().attach("json-process-memory", {
            body: JSON.stringify({
              budgetKiB,
              budgetEnforced: process.env.DBAPP_PERFORMANCE_BUDGETS === "1",
              forcedGarbageCollection: false,
              samples,
            }),
            contentType: "application/json",
          });
        }
      }
      if (process.env.DBAPP_SCALAR_QUALIFICATION === "1") {
        if (await panel.isVisible())
          await panel.getByRole("button", { name: "Close JSON", exact: true }).click();
        await sql.focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.type("SELECT json_build_object('payload', repeat('x', 10000000))");
        await page.getByRole("button", { name: "Run SQL / selection", exact: true }).click();
        await expect(page.locator(".query-tab output")).toContainText("complete");
        await page.getByRole("button", { name: "Inspect JSON", exact: true }).click();
        await expect(panel.getByRole("treeitem")).toHaveCount(2);
        const durations = [];
        for (let index = 0; index < 10; index++) {
          durations.push(
            await panel
              .getByRole("treeitem")
              .nth(index % 2)
              .evaluate(async (element) => {
                const start = performance.now();
                element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                await new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
                return performance.now() - start;
              }),
          );
        }
        await test.info().attach("json-large-scalar-selection", {
          body: JSON.stringify({ bytes: 10000000, durations }),
          contentType: "application/json",
        });
        console.log("Large scalar selection", JSON.stringify(durations));
        if (process.env.DBAPP_PERFORMANCE_BUDGETS === "1")
          for (const duration of durations) expect(duration).toBeLessThan(100);
      }
    } finally {
      // Test teardown explicitly discards live editors; user close remains guarded.
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      );
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("Chromium JSON worker large parse, search, cancellation and stale identity", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rowberry-json-bench-"));
  const app = await electron.launch({
    executablePath: process.env.DBAPP_PACKAGE_EXECUTABLE,
    args: [
      ...(process.env.DBAPP_PACKAGE_EXECUTABLE ? [] : [path.resolve(".")]),
      `--user-data-dir=${directory}`,
    ],
  });
  try {
    const page = await app.firstWindow();
    const asset = await app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule("node:fs");
      const path = process.getBuiltinModule("node:path");
      return fs
        .readdirSync(path.join(app.getAppPath(), "dist/renderer/assets"))
        .find((name) => name.startsWith("worker-") && name.endsWith(".js"));
    });
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
    await test.info().attach("json-worker-performance", {
      body: JSON.stringify(metrics),
      contentType: "application/json",
    });
    if (process.env.DBAPP_PERFORMANCE_BUDGETS === "1") {
      expect(metrics.parseMs).toBeLessThan(1000);
      expect(metrics.searchMs).toBeLessThan(250);
      expect(metrics.cancelSearchMs).toBeLessThan(100);
      expect(metrics.cancelParseMs).toBeLessThan(100);
    }
    expect(metrics.bytes).toBeGreaterThan(10 * 1024 * 1024);
    expect(metrics.editable).toBe(true);
    expect(metrics.matches).toBe(1);
    expect(metrics.searchMs).toBeLessThan(2000);
  } finally {
    // Test teardown explicitly discards live editors; user close remains guarded.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
