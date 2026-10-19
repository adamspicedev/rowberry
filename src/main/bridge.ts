import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  bounded,
  CommandSchema,
  failure,
  ReplySchema,
  REQUEST_CHANNEL,
  type Reply,
} from "../shared/protocol";
export function trustedSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow,
  rendererURL: string,
): boolean {
  return (
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === rendererURL
  );
}
export function installBridge(getWindow: () => BrowserWindow | null, rendererURL: string): void {
  ipcMain.handle(REQUEST_CHANNEL, (event, input: unknown): Reply => {
    const window = getWindow();
    if (!window || !trustedSender(event, window, rendererURL)) return failure("UNTRUSTED_SENDER");
    if (!bounded(input)) return failure("VALIDATION_ERROR");
    const parsed = CommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR");
    try {
      const command = parsed.data;
      switch (command.kind) {
        case "app.info":
          return ReplySchema.parse({
            ok: true,
            requestId: command.requestId,
            kind: command.kind,
            data: { name: app.getName(), version: app.getVersion(), platform: process.platform },
          });
        default: {
          const exhaustive: never = command.kind;
          return exhaustive;
        }
      }
    } catch {
      return failure("INTERNAL_ERROR", parsed.data.requestId);
    }
  });
}
