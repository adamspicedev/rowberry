import { emptyWorkspace, WorkspaceSchema, type Workspace } from "../../shared/workspace";
import { RequestIdSchema } from "../../shared/protocol";
let state = emptyWorkspace();
let initialized = false;
let pendingInitialUpdates: Partial<Workspace> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
let error = "";
const notify = () => listeners.forEach((listener) => listener());
export const workspaceState = () => state;
export const workspaceError = () => error;
export const canReadWorkspace = () => !initialized;
export const subscribeWorkspace = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
export async function loadWorkspace() {
  // Reading is only an initial-load recovery action. A failed write must retry
  // saving the live snapshot, never replace it with an older disk snapshot.
  if (initialized) return state;
  const reply = await window.dbapp.request({ kind: "workspace.load", requestId: requestId() });
  if (initialized) return state;
  if (reply.ok && reply.kind === "workspace.load") {
    const drafts = new Map(reply.data.drafts.map((draft) => [draft.id, draft]));
    for (const draft of pendingInitialUpdates.drafts ?? []) drafts.set(draft.id, draft);
    state = { ...reply.data, ...pendingInitialUpdates, drafts: [...drafts.values()] };
    if (!state.recoveryEnabled) state = { ...state, sql: [], drafts: [] };
    pendingInitialUpdates = {};
    error = "";
  } else
    error =
      "Workspace recovery could not be read. Your stored data was left untouched. Use Retry to read it again, or continue with local drafts and export them before closing.";
  initialized = reply.ok;
  // Migrate legacy SQL only when recovery is enabled, and remove the old key
  // only after a successful transactional write. Disabled recovery never reads it.
  try {
    const legacy = state.recoveryEnabled ? localStorage.getItem("rowberry.sql.drafts") : null;
    if (legacy && !state.sql.length && initialized) {
      const raw: unknown = JSON.parse(legacy);
      if (!Array.isArray(raw)) throw new Error("Invalid legacy SQL drafts");
      const sql = raw.map((item: unknown) =>
        typeof item === "object" && item !== null && "sql" in item ? item.sql : null,
      );
      const migrated = WorkspaceSchema.parse({ ...state, sql });
      const saved = await window.dbapp.request({
        kind: "workspace.save",
        requestId: requestId(),
        state: migrated,
      });
      if (!saved.ok) throw new Error("Legacy SQL migration failed");
      state = migrated;
    }
    if (initialized) localStorage.removeItem("rowberry.sql.drafts");
  } catch {
    error =
      "Legacy SQL drafts could not be migrated or removed. They were left in browser storage. Free disk space and Retry before clearing storage.";
  }
  notify();
  return state;
}
export async function flushWorkspace() {
  if (!initialized) return false;
  clearTimeout(timer);
  const snapshot = state;
  const reply = await window.dbapp.request({
    kind: "workspace.save",
    requestId: requestId(),
    state: snapshot,
  });
  error = reply.ok
    ? error.startsWith("Legacy")
      ? error
      : ""
    : "Workspace could not be saved. Free disk space and Retry. Keep this window open or copy your drafts before closing.";
  notify();
  return reply.ok;
}
export function updateWorkspace(update: Partial<Workspace>) {
  if (!initialized) pendingInitialUpdates = { ...pendingInitialUpdates, ...update };
  state = { ...state, ...update };
  if (update.recoveryEnabled === false) {
    try {
      localStorage.removeItem("rowberry.sql.drafts");
    } catch {
      error =
        "Legacy SQL drafts could not be removed. Clear browser storage before considering recovery disabled on this device.";
    }
  }
  if (!state.recoveryEnabled) {
    // Keep live editors in their components, but persist no recoverable content.
    state = { ...state, sql: [], drafts: [] };
  }
  notify();
  if (initialized) {
    clearTimeout(timer);
    timer = setTimeout(() => void flushWorkspace(), 300);
  }
}
export function recordDraft(
  id: string,
  kind: Workspace["drafts"][number]["kind"],
  label: string,
  text: string | null,
) {
  if (!state.recoveryEnabled) return;
  const drafts = state.drafts.filter((draft) => draft.id !== id);
  if (text !== null) drafts.push({ id, kind, label, text });
  updateWorkspace({ drafts });
}
