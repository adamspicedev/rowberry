import { afterEach, expect, test, vi } from "vitest";
import { emptyWorkspace } from "../../shared/workspace";
import { failure, type Command, type Reply } from "../../shared/protocol";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});
test("failed persistence retains invalid live text and exposes actionable retry guidance", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, removeItem: vi.fn() });
  vi.stubGlobal("window", {
    dbapp: {
      request: async (command: Command): Promise<Reply> =>
        command.kind === "workspace.load"
          ? {
              ok: true,
              kind: "workspace.load",
              requestId: command.requestId,
              data: emptyWorkspace(),
            }
          : failure("INTERNAL_ERROR", command.requestId),
    },
  });
  const workspace = await import("./workspace");
  await workspace.loadWorkspace();
  workspace.recordDraft("invalid", "json", "local copy", "{broken");
  expect(await workspace.flushWorkspace()).toBe(false);
  expect(workspace.workspaceState().drafts[0]?.text).toBe("{broken");
  expect(workspace.workspaceError()).toContain("Keep this window open");
  // A retry must never reread the older disk snapshot over newer local copies.
  workspace.recordDraft("invalid", "json", "local copy", "{latest closed editor");
  await workspace.loadWorkspace();
  expect(workspace.workspaceState().drafts[0]?.text).toBe("{latest closed editor");
  expect(workspace.workspaceError()).toContain("Keep this window open");
});
test("disabled recovery removes legacy storage and never persists live SQL or JSON", async () => {
  vi.useFakeTimers();
  const removeItem = vi.fn();
  const writes: unknown[] = [];
  vi.stubGlobal("localStorage", { getItem: () => null, removeItem });
  vi.stubGlobal("window", {
    dbapp: {
      request: async (command: Command): Promise<Reply> => {
        if (command.kind === "workspace.load")
          return {
            ok: true,
            kind: command.kind,
            requestId: command.requestId,
            data: emptyWorkspace(),
          };
        if (command.kind === "workspace.save") {
          writes.push(command.state);
          return { ok: true, kind: command.kind, requestId: command.requestId, data: {} };
        }
        return failure("VALIDATION_ERROR", command.requestId);
      },
    },
  });
  const workspace = await import("./workspace");
  await workspace.loadWorkspace();
  workspace.updateWorkspace({ recoveryEnabled: false });
  workspace.updateWorkspace({ sql: ["private"] });
  workspace.recordDraft("j", "json", "local", "private");
  expect(await workspace.flushWorkspace()).toBe(true);
  expect(writes).toEqual([
    expect.objectContaining({ recoveryEnabled: false, sql: [], drafts: [] }),
  ]);
  expect(removeItem).toHaveBeenCalledWith("rowberry.sql.drafts");
});

test("retrying an initial read failure merges pending local copies with stored recovery", async () => {
  vi.useFakeTimers();
  let reads = 0;
  vi.stubGlobal("localStorage", { getItem: () => null, removeItem: vi.fn() });
  vi.stubGlobal("window", {
    dbapp: {
      request: async (command: Command): Promise<Reply> => {
        if (command.kind !== "workspace.load" || ++reads === 1)
          return failure("INTERNAL_ERROR", command.requestId);
        return {
          ok: true,
          kind: command.kind,
          requestId: command.requestId,
          data: {
            ...emptyWorkspace(),
            drafts: [{ id: "older", kind: "json", label: "stored", text: "{older" }],
          },
        };
      },
    },
  });
  const workspace = await import("./workspace");
  await workspace.loadWorkspace();
  workspace.recordDraft("newer", "json", "local copy", "{newer");
  await workspace.loadWorkspace();
  expect(workspace.workspaceState().drafts.map((draft) => draft.text)).toEqual([
    "{older",
    "{newer",
  ]);
  expect(workspace.canReadWorkspace()).toBe(false);
});

test("legacy migration retry recovers SQL while retaining new local drafts", async () => {
  vi.useFakeTimers();
  let failSave = true;
  let legacy: string | null = JSON.stringify([{ sql: "SELECT legacy_private" }]);
  const writes: unknown[] = [];
  vi.stubGlobal("localStorage", {
    getItem: () => legacy,
    removeItem: () => {
      legacy = null;
    },
  });
  vi.stubGlobal("window", {
    dbapp: {
      request: async (command: Command): Promise<Reply> => {
        if (command.kind === "workspace.load")
          return {
            ok: true,
            kind: command.kind,
            requestId: command.requestId,
            data: emptyWorkspace(),
          };
        if (command.kind === "workspace.save") {
          if (failSave) return failure("INTERNAL_ERROR", command.requestId);
          writes.push(command.state);
          return { ok: true, kind: command.kind, requestId: command.requestId, data: {} };
        }
        return failure("VALIDATION_ERROR", command.requestId);
      },
    },
  });
  const workspace = await import("./workspace");
  await workspace.loadWorkspace();
  expect(workspace.workspaceError()).toContain("Legacy SQL");
  workspace.recordDraft("latest", "json", "closed original editor", "{latest");
  const editor = await import("../features/query/query-state");
  editor.saveDrafts(["SELECT newer_editor"]);
  expect(editor.loadDrafts()).toEqual(["SELECT newer_editor"]);
  failSave = false;
  expect(workspace.canRetryLegacyMigration()).toBe(true);
  expect(workspace.canRetryWorkspaceSave()).toBe(false);
  await workspace.retryLegacyMigration();
  expect(workspace.workspaceState().sql).toEqual(["SELECT newer_editor"]);
  expect(workspace.workspaceState().drafts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "sql", text: "SELECT legacy_private" }),
      expect.objectContaining({ kind: "json", text: "{latest" }),
    ]),
  );
  expect(writes).toEqual([
    expect.objectContaining({
      sql: ["SELECT newer_editor"],
      drafts: expect.arrayContaining([
        expect.objectContaining({ kind: "sql", text: "SELECT legacy_private" }),
        expect.objectContaining({ kind: "json", text: "{latest" }),
      ]),
    }),
  ]);
  expect(legacy).toBeNull();
  expect(workspace.workspaceError()).toBe("");
  // The already open editor keeps its own tabs; its next edit must not erase recovery.
  editor.saveDrafts(["SELECT next_editor_change"]);
  await workspace.flushWorkspace();
  expect(workspace.workspaceState().sql).toContain("SELECT next_editor_change");
  expect(workspace.workspaceState().drafts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "sql", text: "SELECT legacy_private" }),
      expect.objectContaining({ kind: "json", text: "{latest" }),
    ]),
  );
  expect(writes.at(-1)).toEqual(
    expect.objectContaining({
      sql: ["SELECT next_editor_change"],
      drafts: expect.arrayContaining([
        expect.objectContaining({ kind: "sql", text: "SELECT legacy_private" }),
      ]),
    }),
  );
});
