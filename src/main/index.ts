import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installBridge } from "./bridge";
import { mkdirSync } from "node:fs";
import { ConnectionStore } from "./store";
import { NativeCredentialStore } from "./credentials";
import { DatabaseProcess } from "./database-process";
import { EVENT_CHANNEL } from "../shared/protocol";
import { ConnectionService } from "./connections";
import { createWindow } from "./windows";
app.enableSandbox();
const userDataOverride = app.commandLine.getSwitchValue("user-data-dir");
// Preserve the original profile directory when the packaged product name changes.
app.setPath(
  "userData",
  userDataOverride ? path.resolve(userDataOverride) : path.join(app.getPath("appData"), "dbapp"),
);
app.setName("Rowberry");
let mainWindow: BrowserWindow | null = null;
const rendererPath = path.join(__dirname, "../renderer/index.html");
app.whenReady().then(() => {
  const dataPath = app.getPath("userData");
  mkdirSync(dataPath, { recursive: true, mode: 0o700 });
  const store = new ConnectionStore(path.join(dataPath, "profiles.sqlite"));
  const connections = new ConnectionService(store, new NativeCredentialStore());
  const sessions = new DatabaseProcess((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(EVENT_CHANNEL, event);
  });
  app.once("will-quit", () => {
    sessions.stop();
    store.close();
  });
  installBridge(() => mainWindow, pathToFileURL(rendererPath).href, connections, sessions);
  const open = () => {
    mainWindow = createWindow(rendererPath);
    // Renderer state is ephemeral. A new main-frame document must not inherit
    // an invisible live worker or finish a previous document's pending connect.
    mainWindow.webContents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) sessions.stop();
    });
    mainWindow.on("closed", () => {
      sessions.stop();
      mainWindow = null;
    });
  };
  open();
  app.on("activate", () => {
    if (!mainWindow) open();
  });
  if (process.argv.includes("--smoke-test")) {
    const timer = setTimeout(() => app.exit(1), 15000);
    mainWindow?.webContents.once("did-finish-load", () => {
      void mainWindow?.webContents
        .executeJavaScript(
          `(async()=>{const reply=await window.dbapp.request({kind:'app.info',requestId:'package-smoke'});return typeof window.require==='undefined' && reply.ok && !!document.querySelector('[data-app-ready]')})()`,
        )
        .then((valid) => {
          clearTimeout(timer);
          process.stdout.write(valid ? "DBAPP_SMOKE_OK\n" : "DBAPP_SMOKE_FAILED\n");
          app.exit(valid ? 0 : 1);
        })
        .catch(() => {
          clearTimeout(timer);
          app.exit(1);
        });
    });
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || process.argv.includes("--smoke-test")) app.quit();
});
