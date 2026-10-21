import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("main rejects malformed commands even when preload validation is bypassed", async () => {
  // Copy the real build and add a test-only raw IPC caller in its trusted preload.
  // Production sources and artifacts remain unchanged, with no test bypass shipped.
  // Windows TEMP may use an 8.3 alias; Chromium resolves it before reporting its URL.
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "dbapp-boundary-")));
  try {
    await cp("dist", path.join(directory, "dist"), { recursive: true });
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({ name: "dbapp-test", version: "0.1.0", main: "dist/main/index.cjs" }),
    );
    const preloadPath = path.join(directory, "dist/preload/index.cjs");
    await writeFile(
      preloadPath,
      (await readFile(preloadPath, "utf8")) +
        "\nrequire('electron').contextBridge.exposeInMainWorld('rawRequest',input=>require('electron').ipcRenderer.invoke('dbapp:request',input));\n",
    );
    const application = await electron.launch({
      args: [directory, `--user-data-dir=${path.join(directory, "user-data")}`],
    });
    try {
      const page = await application.firstWindow();
      const result = await page.evaluate(async () => {
        const raw = Reflect.get(window, "rawRequest");
        return {
          control: await raw({ kind: "app.info", requestId: "control" }),
          malformed: await raw({ kind: "app.info", requestId: "bad", extra: "not-allowed" }),
          oversized: await raw({ kind: "app.info", requestId: "x".repeat(70000) }),
        };
      });
      expect(result.control).toMatchObject({ ok: true, requestId: "control" });
      expect(result.malformed).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
      expect(result.malformed).not.toHaveProperty("data");
      expect(result.oversized).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    } finally {
      await application.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
