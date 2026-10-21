import { app, BrowserWindow, dialog } from "electron";
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
import { profilePath } from "./profile-path";
app.enableSandbox();
const userDataOverride = app.commandLine.getSwitchValue("user-data-dir");
// Preserve the original profile directory when the packaged product name changes.
app.setPath("userData", profilePath(app.getPath("appData"), userDataOverride));
app.setName("Rowberry");
let mainWindow: BrowserWindow | null = null;
const rendererPath = path.join(__dirname, "../renderer/index.html");
app.whenReady().then(() => {
  const dataPath = app.getPath("userData");
  let store: ConnectionStore;
  try {
    mkdirSync(dataPath, { recursive: true, mode: 0o700 });
    store = new ConnectionStore(path.join(dataPath, "profiles.sqlite"));
  } catch {
    const choice = dialog.showMessageBoxSync({
      type: "error",
      buttons: ["Quit", "Open temporary workspace"],
      defaultId: 0,
      title: "Local storage unavailable",
      message: "Rowberry could not open local storage. Your existing file has been preserved.",
      detail:
        "Check disk space and permissions for " +
        dataPath +
        ". A temporary workspace does not recover or permanently save profiles, queries or drafts.",
    });
    if (choice !== 1) {
      app.quit();
      return;
    }
    store = new ConnectionStore(":memory:");
  }
  const connections = new ConnectionService(store, new NativeCredentialStore());
  const sessions = new DatabaseProcess((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(EVENT_CHANNEL, event);
  });
  let quitting = false;
  let draining = false;
  let quitRequested = false;
  const finishQuit = () => {
    if (draining) return;
    draining = true;
    sessions.stop();
    void sessions.drain().finally(() => {
      quitting = true;
      app.quit();
    });
  };
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    if (draining) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      quitRequested = true;
      mainWindow.close();
      return;
    }
    finishQuit();
  });
  app.once("will-quit", () => {
    sessions.stop();
    store.close();
  });
  installBridge(() => mainWindow, pathToFileURL(rendererPath).href, connections, sessions, store);
  const open = () => {
    mainWindow = createWindow(rendererPath);
    mainWindow.webContents.on("will-prevent-unload", (event) => {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: "warning",
        buttons: ["Keep editing", "Discard live drafts and close"],
        defaultId: 0,
        cancelId: 0,
        title: "Unsaved drafts",
        message: "Close with unsaved drafts?",
        detail:
          "Draft recovery may be unavailable or still saving. Keep editing to copy or save important work first.",
      });
      if (choice === 1) event.preventDefault();
      else quitRequested = false;
    });
    // Renderer state is ephemeral. A new main-frame document must not inherit
    // an invisible live worker or finish a previous document's pending connect.
    mainWindow.webContents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) sessions.stop();
    });
    mainWindow.on("closed", () => {
      sessions.stop();
      mainWindow = null;
      if (quitRequested) {
        finishQuit();
      }
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
          `(async()=>{const deadline=Date.now()+10000;while(!document.querySelector('[data-app-ready]')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));const reply=await window.dbapp.request({kind:'app.info',requestId:'package-smoke'});return typeof window.require==='undefined' && typeof window.process==='undefined' && reply.ok && !!document.querySelector('[data-app-ready]')})()`,
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
