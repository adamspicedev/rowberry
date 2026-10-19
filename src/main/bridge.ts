import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { ConnectionStore } from "./store";
import type { DatabaseProcess } from "./database-process";
import type { ConnectionService } from "./connections";
import {
  boundedCommand,
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
  sessions: DatabaseProcess,
  store: ConnectionStore,
): void {
  let pending = Promise.resolve();
  let queued = 0;
  async function serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (queued >= 32) throw new Error("Too many operations.");
    queued++;
    const previous = pending;
    let release = () => {};
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      queued--;
      release();
    }
  }
  ipcMain.handle(REQUEST_CHANNEL, async (event, input: unknown): Promise<Reply> => {
    const window = getWindow();
    if (!window || !trustedSender(event, window, rendererURL)) return failure("UNTRUSTED_SENDER");
    if (!boundedCommand(input)) return failure("VALIDATION_ERROR");
    const parsed = CommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR");
    const command = parsed.data;
    if (
      command.kind === "schema.list" ||
      command.kind === "rows.fetch" ||
      command.kind === "rows.value" ||
      command.kind === "rows.save" ||
      "tabId" in command
    )
      return sessions.request(command);
    // Closing is never queued behind OS credential access or a network handshake.
    if (command.kind === "sessions.close") {
      sessions.close(command.sessionId);
      return ReplySchema.parse({
        ok: true,
        requestId: command.requestId,
        kind: command.kind,
        data: {},
      });
    }
    if (command.kind === "sessions.open" || command.kind === "connections.connect") {
      const profileId = command.kind === "sessions.open" ? command.profileId : command.id;
      try {
        const data = await sessions.open(profileId, () =>
          serialize(async () => ({
            profile: connections.profile(profileId),
            password: await connections.resolveSecret(profileId),
          })),
        );
        return ReplySchema.parse({
          ok: true,
          requestId: command.requestId,
          kind: command.kind,
          data,
        });
      } catch {
        return failure("CONNECTION_FAILED", command.requestId);
      }
    }
    // Serialize metadata/credential operations so reads cannot race deletion.
    try {
      return await serialize(async () => {
        switch (command.kind) {
          case "queries.saved.list":
            return ReplySchema.parse({
              ok: true,
              kind: command.kind,
              requestId: command.requestId,
              data: store.savedList(command.offset),
            });
          case "queries.saved.get":
            return ReplySchema.parse({
              ok: true,
              kind: command.kind,
              requestId: command.requestId,
              data: store.savedGet(command.id),
            });
          case "queries.saved.save":
            store.savedSave(command.id, command.name, command.sql);
            return ReplySchema.parse({
              ok: true,
              kind: command.kind,
              requestId: command.requestId,
              data: {},
            });
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
          default: {
            const exhaustive: never = command;
            return exhaustive;
          }
        }
      });
    } catch {
      return failure("INTERNAL_ERROR", parsed.data.requestId);
    }
  });
}
