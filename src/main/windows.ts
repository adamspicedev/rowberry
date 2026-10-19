import { BrowserWindow, session } from "electron";
import path from "node:path";
export function createWindow(rendererPath: string): BrowserWindow {
  const applicationSession = session.fromPartition("dbapp");
  applicationSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  applicationSession.setPermissionCheckHandler(() => false);
  applicationSession.on("will-download", (event) => event.preventDefault());
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 500,
    backgroundColor: "#f7f5f0",
    show: false,
    title: "Rowberry",
    icon: path.join(__dirname, "../renderer/app-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      session: applicationSession,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-frame-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  void window.loadFile(rendererPath);
  return window;
}
