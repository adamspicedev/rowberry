import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { ConnectionService } from "./connections";
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
export function installBridge(
  getWindow: () => BrowserWindow | null,
  rendererURL: string,
  connections: ConnectionService,
): void {
  let pending = Promise.resolve();
  let queued = 0;
  ipcMain.handle(REQUEST_CHANNEL, async (event, input: unknown): Promise<Reply> => {
    const window = getWindow();
    if (!window || !trustedSender(event, window, rendererURL)) return failure("UNTRUSTED_SENDER");
    if (!bounded(input)) return failure("VALIDATION_ERROR");
    const parsed = CommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR");
    // Serialize metadata/credential operations so a late native write cannot race deletion.
    if (queued >= 32) return failure("INTERNAL_ERROR", parsed.data.requestId);
    queued++;
    const previous = pending;
    let release = () => {};
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
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
        case "connections.list":
          return ReplySchema.parse({
            ok: true,
            requestId: command.requestId,
            kind: command.kind,
            data: await connections.list(command.offset),
          });
        case "connections.save":
          return ReplySchema.parse({
            ok: true,
            requestId: command.requestId,
            kind: command.kind,
            data: await connections.save(command.profile),
          });
        case "connections.submitSecret":
          return ReplySchema.parse({
            ok: true,
            requestId: command.requestId,
            kind: command.kind,
            data: await connections.submitSecret(command.id, command.secret, command.persist),
          });
        case "connections.delete":
          await connections.delete(command.id);
          return ReplySchema.parse({
            ok: true,
            requestId: command.requestId,
            kind: command.kind,
            data: {},
          });
        case "connections.connect":
          return failure("UNAVAILABLE", command.requestId);
        default: {
          const exhaustive: never = command;
          return exhaustive;
        }
      }
    } catch {
      return failure("INTERNAL_ERROR", parsed.data.requestId);
    } finally {
      queued--;
      release();
    }
  });
}
