import { emptyWorkspace, WorkspaceSchema, type Workspace } from "../../shared/workspace";
import { RequestIdSchema } from "../../shared/protocol";
let state = emptyWorkspace();
let initialized = false;
let pendingInitialUpdates: Partial<Workspace> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
let error = "";
let migrationError = "";
let migrationPending = false;
const notify = () => listeners.forEach((listener) => listener());
export const workspaceState = () => state;
export const workspaceError = () => [error, migrationError].filter(Boolean).join(" ");
export const canRetryLegacyMigration = () => !!migrationError;
export const canReadWorkspace = () => !initialized;
export const canRetryWorkspaceSave = () => initialized && !!error;
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
  const hadPendingUpdates = Object.keys(pendingInitialUpdates).length > 0;
  if (reply.ok && reply.kind === "workspace.load") {
    const drafts = new Map(reply.data.drafts.map((draft) => [draft.id, draft]));
    for (const draft of pendingInitialUpdates.drafts ?? []) drafts.set(draft.id, draft);
    // Live SQL tabs own their current array. Preserve displaced disk tabs as
    // detached copies rather than replacing the editor or silently losing them.
    if (pendingInitialUpdates.sql !== undefined) {
      reply.data.sql.forEach((text, index) => {
        if (!text || pendingInitialUpdates.sql?.includes(text)) return;
        if ([...drafts.values()].some((draft) => draft.kind === "sql" && draft.text === text))
          return;
        const id = `read-retry-sql:${crypto.randomUUID()}`;
        drafts.set(id, {
          id,
          kind: "sql",
          label: `Stored SQL tab ${index + 1} (copy only; paste into a new SQL tab explicitly)`,
          text,
        });
      });
    }
    state = { ...reply.data, ...pendingInitialUpdates, drafts: [...drafts.values()] };
    if (!state.recoveryEnabled) state = { ...state, sql: [], drafts: [] };
    pendingInitialUpdates = {};
    error = "";
  } else
    error =
      "Workspace recovery could not be read. Your stored data was left untouched. Use Retry to read it again, or continue with local drafts and export them before closing.";
  initialized = reply.ok;
  if (initialized) {
    await retryLegacyMigration();
    // Edits made before a successful read could not schedule persistence.
    // Save the merged live snapshot even if the user makes no further edits.
    if (hadPendingUpdates) await flushWorkspace();
  }
  notify();
  return state;
}
export async function retryLegacyMigration() {
  if (!initialized || migrationPending) return false;
  migrationPending = true;
  try {
    // Read only the legacy key, never replace live state from the SQLite snapshot.
    // Disabled recovery removes the key without reading its sensitive contents.
    const legacy = state.recoveryEnabled ? localStorage.getItem("rowberry.sql.drafts") : null;
    if (legacy) {
      const raw: unknown = JSON.parse(legacy);
      if (!Array.isArray(raw)) throw new Error("Invalid legacy SQL drafts");
      const values = raw.map((item: unknown) =>
        typeof item === "object" && item !== null && "sql" in item ? item.sql : null,
      );
      const legacySql = WorkspaceSchema.shape.sql.parse(values);
      // Active SQL editors own their tab array and may save it again immediately.
      // Keep migrated SQL in independent copy-only recovery until explicitly copied
      // or discarded; never inject it into an editor's stale tab snapshot.
      const drafts = new Map(state.drafts.map((draft) => [draft.id, draft]));
      legacySql.forEach((text, index) =>
        drafts.set(`legacy-sql:${index}`, {
          id: `legacy-sql:${index}`,
          kind: "sql",
          label: `Legacy SQL tab ${index + 1} (copy only; paste into a new SQL tab explicitly)`,
          text,
        }),
      );
      const migrated = WorkspaceSchema.parse({ ...state, drafts: [...drafts.values()] });
      state = migrated;
      const saved = await window.dbapp.request({
        kind: "workspace.save",
        requestId: requestId(),
        state: migrated,
      });
      if (!saved.ok) throw new Error("Legacy SQL migration failed");
    }
    localStorage.removeItem("rowberry.sql.drafts");
    migrationError = "";
    return true;
  } catch {
    migrationError =
      "Legacy SQL drafts could not be migrated or removed. They were left in browser storage. Free disk space and Retry legacy SQL migration before clearing storage.";
    return false;
  } finally {
    migrationPending = false;
    notify();
  }
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
    ? ""
    : reply.error.code === "VALIDATION_ERROR"
      ? "Workspace recovery exceeds a supported limit: 1 MiB per draft, 16 SQL tabs, 32 recovered copies, or the total saved size. Keep this window open. Copy important drafts elsewhere, then reduce large drafts or remove unneeded copies and retry saving."
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
      migrationError = "";
    } catch {
      migrationError =
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

// Only mounted inspectors participate; detached recovered copies remain untouched.
export function discardLiveJsonDrafts() {
  window.dispatchEvent(new Event("rowberry:discard-json"));
}
