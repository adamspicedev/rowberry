import { contextBridge, ipcRenderer } from "electron";
import {
  AppEventSchema,
  bounded,
  CommandSchema,
  EVENT_CHANNEL,
  failure,
  ReplySchema,
  REQUEST_CHANNEL,
  type DesktopBridge,
  type EventListener,
} from "../shared/protocol";
const listeners = new Map<
  EventListener,
  (_event: Electron.IpcRendererEvent, input: unknown) => void
>();
const bridge: DesktopBridge = {
  async request(command) {
    if (!bounded(command)) return failure("VALIDATION_ERROR");
    const parsed = CommandSchema.safeParse(command);
    if (!parsed.success) return failure("VALIDATION_ERROR");
    try {
      const input: unknown = await ipcRenderer.invoke(REQUEST_CHANNEL, parsed.data);
      if (!bounded(input)) return failure("INTERNAL_ERROR", parsed.data.requestId);
      const reply = ReplySchema.safeParse(input);
      if (!reply.success || reply.data.requestId !== parsed.data.requestId)
        return failure("INTERNAL_ERROR", parsed.data.requestId);
      return reply.data;
    } catch {
      return failure("INTERNAL_ERROR", parsed.data.requestId);
    }
  },
  subscribe(listener) {
    bridge.unsubscribe(listener);
    const handler = (_event: Electron.IpcRendererEvent, input: unknown) => {
      if (!bounded(input)) return;
      const event = AppEventSchema.safeParse(input);
      if (event.success) listener(event.data);
    };
    listeners.set(listener, handler);
    ipcRenderer.on(EVENT_CHANNEL, handler);
    return () => bridge.unsubscribe(listener);
  },
  unsubscribe(listener) {
    const handler = listeners.get(listener);
    if (handler) {
      ipcRenderer.removeListener(EVENT_CHANNEL, handler);
      listeners.delete(listener);
    }
  },
};
if (process.isMainFrame && process.sandboxed && process.contextIsolated) {
  contextBridge.exposeInMainWorld("dbapp", bridge);
}
