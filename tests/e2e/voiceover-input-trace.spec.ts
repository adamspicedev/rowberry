import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installInputTrace } from "../voiceover/input-trace";

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "rowberry-input-trace-"));
  await writeFile(
    path.join(directory, "main.cjs"),
    `const { app, BrowserWindow } = require("electron");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const window = new BrowserWindow({width: 600, height: 400, title: "Rowberry input trace fixture", webPreferences: {sandbox: true, contextIsolation: true}});
  await window.loadFile(require("node:path").join(__dirname, "fixture.html"));
});`,
  );
  await writeFile(
    path.join(directory, "fixture.html"),
    `<!doctype html><html><body data-key-count="0">
<div id="tree" role="tree" aria-label="JSON tree" tabindex="0">Fixture tree</div>
<button id="resize" aria-label="Resize JSON panel">private button text</button>
<input id="editor" aria-label="Editor" value="private initial value">
<script>
document.getElementById("tree").addEventListener("keydown", event => {
  if (event.key === "ArrowDown") document.body.dataset.keyCount = String(Number(document.body.dataset.keyCount) + 1);
  if (event.key === "Home") {
    event.preventDefault();
    setTimeout(() => document.getElementById("resize").focus(), 10);
  }
});
</script></body></html>`,
  );
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [
        path.join(directory, "main.cjs"),
        `--user-data-dir=${path.join(directory, "profile")}`,
      ],
    });
    const running = app;
    const page = await running.firstWindow();
    await page.getByRole("tree", { name: "JSON tree" }).waitFor();
    return {
      app: running,
      page,
      async close() {
        await running.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await app?.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function sendHome(app: ElectronApplication) {
  // Electron-injected events exercise before-input-event, but do not qualify
  // native OS input or VoiceOver. This applies to the printable/arrow cases too.
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    contents.sendInputEvent({ type: "keyDown", keyCode: "Home" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "Home" });
  });
}

async function nativeListenerCounts(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    return [
      window.listenerCount("focus"),
      window.listenerCount("blur"),
      window.webContents.listenerCount("before-input-event"),
      window.webContents.listenerCount("focus"),
      window.webContents.listenerCount("blur"),
    ];
  });
}

async function rendererListenerCounts(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { result } = await session.send("Runtime.evaluate", { expression: "window" });
    if (!result.objectId) throw new Error("Fixture window is unavailable");
    const { listeners } = await session.send("DOMDebugger.getEventListeners", {
      objectId: result.objectId,
    });
    return listeners
      .map(
        (listener: { type: string; useCapture: boolean }) =>
          `${listener.type}:${listener.useCapture}`,
      )
      .sort();
  } finally {
    await session.detach();
  }
}

test("input tracing retains consumed Home and late focus without printable content or leaked listeners", async () => {
  const run = await fixture();
  const { app, page } = run;
  const nativeBefore = await nativeListenerCounts(app);
  const rendererBefore = await rendererListenerCounts(page);
  const trace = await installInputTrace(app, page);
  try {
    const tree = page.getByRole("tree", { name: "JSON tree" });
    await tree.focus();
    await trace.start();
    await sendHome(app);
    await expect(page.getByRole("button", { name: "Resize JSON panel" })).toBeFocused();
    const report = await trace.stop();
    expect(report.native.status).toBe("captured");
    expect(report.renderer.status).toBe("captured");
    if (report.native.status !== "captured" || report.renderer.status !== "captured")
      throw new Error("Both trace layers must be available");
    expect(report.native.events).toContainEqual(
      expect.objectContaining({ kind: "before-input-event", type: "keyDown", key: "Home" }),
    );
    expect(report.renderer.events).toContainEqual(
      expect.objectContaining({
        kind: "keydown",
        phase: "capture",
        key: "Home",
        defaultPrevented: false,
      }),
    );
    expect(report.renderer.events).toContainEqual(
      expect.objectContaining({
        kind: "keydown",
        phase: "bubble",
        key: "Home",
        defaultPrevented: true,
      }),
    );
    expect(report.renderer.start.activeElement).toMatchObject({ id: "tree", role: "tree" });
    expect(report.renderer.end.activeElement).toMatchObject({
      id: "resize",
      ariaLabel: "Resize JSON panel",
    });
    expect(report.renderer.events).toContainEqual(
      expect.objectContaining({
        kind: "focusin",
        target: expect.objectContaining({ id: "resize" }),
      }),
    );

    await page.getByRole("textbox", { name: "Editor" }).focus();
    await trace.start();
    await page.keyboard.type("private typed value");
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      for (const character of "privatenativevalue") {
        contents.sendInputEvent({ type: "keyDown", keyCode: character });
        contents.sendInputEvent({ type: "char", keyCode: character });
        contents.sendInputEvent({ type: "keyUp", keyCode: character });
      }
    });
    await expect(page.getByRole("textbox", { name: "Editor" })).toHaveValue(/privatenativevalue/);
    const privateInput = await trace.stop();
    expect(JSON.stringify(privateInput)).not.toMatch(
      /private (?:typed|initial|button)|privatenativevalue/,
    );
    expect(privateInput.native.status).toBe("captured");
    expect(privateInput.renderer.status).toBe("captured");
    if (privateInput.native.status === "captured" && privateInput.renderer.status === "captured") {
      expect(privateInput.native.events).toEqual([]);
      expect(privateInput.renderer.events).toEqual([]);
    }

    await tree.focus();
    await page.evaluate(() => {
      document.body.dataset.keyCount = "0";
    });
    await trace.start();
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      for (let index = 0; index < 50; index++) {
        contents.sendInputEvent({ type: "keyDown", keyCode: "Down" });
        contents.sendInputEvent({ type: "keyUp", keyCode: "Down" });
      }
    });
    await expect.poll(() => page.evaluate(() => document.body.dataset.keyCount)).toBe("50");
    const bounded = await trace.stop();
    for (const layer of [bounded.native, bounded.renderer]) {
      expect(layer.status).toBe("captured");
      if (layer.status === "captured") {
        expect(layer.events).toHaveLength(64);
        expect(layer.droppedEvents).toBeGreaterThan(0);
      }
    }
    // Recording remains disabled after stop, even if more navigation occurs.
    await sendHome(app);
    await expect(page.getByRole("button", { name: "Resize JSON panel" })).toBeFocused();
    const stopped = await trace.stop();
    expect(stopped.native.status === "captured" && stopped.native.events).toEqual(
      bounded.native.status === "captured" && bounded.native.events,
    );
    expect(stopped.renderer.status === "captured" && stopped.renderer.events).toEqual(
      bounded.renderer.status === "captured" && bounded.renderer.events,
    );
    await trace.dispose();
    expect(await nativeListenerCounts(app)).toEqual(nativeBefore);
    expect(await rendererListenerCounts(page)).toEqual(rendererBefore);
  } finally {
    await trace.dispose();
    await run.close();
  }
});

test("input tracing preserves native evidence if the renderer context is replaced", async () => {
  const run = await fixture();
  const { app, page } = run;
  const trace = await installInputTrace(app, page);
  try {
    await page.getByRole("tree", { name: "JSON tree" }).focus();
    await trace.start();
    await sendHome(app);
    await expect(page.getByRole("button", { name: "Resize JSON panel" })).toBeFocused();
    await page.goto("data:text/html,<p>Replacement fixture document</p>");
    const report = await trace.stop();
    expect(report.renderer).toMatchObject({ status: "unavailable" });
    expect(report.native.status).toBe("captured");
    if (report.native.status === "captured")
      expect(report.native.events).toContainEqual(
        expect.objectContaining({ kind: "before-input-event", key: "Home" }),
      );
  } finally {
    await trace.dispose();
    await run.close();
  }
});
