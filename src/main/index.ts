import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installBridge } from "./bridge";
import { createWindow } from "./windows";
app.enableSandbox();
let mainWindow: BrowserWindow | null = null;
const rendererPath = path.join(__dirname, "../renderer/index.html");
app.whenReady().then(() => {
  installBridge(() => mainWindow, pathToFileURL(rendererPath).href);
  const open = () => {
    mainWindow = createWindow(rendererPath);
    mainWindow.on("closed", () => {
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
