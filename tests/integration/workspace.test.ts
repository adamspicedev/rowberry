import { test, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConnectionStore } from "../../src/main/store";
import { emptyWorkspace } from "../../src/shared/workspace";
test("workspace survives reopening and disabling recovery removes SQL and drafts", () => {
  const store = new ConnectionStore(":memory:");
  const state = {
    ...emptyWorkspace(),
    sql: ["select private"],
    drafts: [
      { id: "j", kind: "json" as const, label: "value", text: "{invalid" },
      { id: "legacy-sql:0", kind: "sql" as const, label: "legacy copy", text: "DELETE NEVER_RUN" },
    ],
  };
  store.workspaceSave(state);
  expect(store.workspaceLoad()).toEqual(state);
  store.workspaceSave({ ...state, recoveryEnabled: false });
  expect(store.workspaceLoad()).toEqual({ ...state, recoveryEnabled: false, sql: [], drafts: [] });
  store.close();
});

test("real SQLite full database rolls back workspace and preserves caller draft", () => {
  const db = new DatabaseSync(":memory:");
  const store = new ConnectionStore(":memory:", () => db);
  const original = emptyWorkspace();
  store.workspaceSave(original);
  const count = db.prepare("PRAGMA page_count").get()?.page_count;
  db.exec(`PRAGMA max_page_count = ${count}`);
  const draft = { ...original, sql: ["x".repeat(1024 * 1024)] };
  expect(() => store.workspaceSave(draft)).toThrow("Workspace could not be saved");
  expect(draft.sql[0]?.length).toBe(1024 * 1024);
  expect(store.workspaceLoad()).toEqual(original);
  store.close();
});
test("corrupt storage is rejected without overwriting the source", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rowberry-corrupt-"));
  const file = path.join(dir, "profiles.sqlite");
  try {
    writeFileSync(file, "corrupt sentinel");
    expect(() => new ConnectionStore(file)).toThrow();
    expect(readFileSync(file, "utf8")).toBe("corrupt sentinel");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("versioned workspace is restored from the same file after reopening", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rowberry-restart-"));
  const file = path.join(dir, "profiles.sqlite");
  try {
    const store = new ConnectionStore(file);
    const draft = {
      ...emptyWorkspace(),
      drafts: [
        {
          id: "invalid",
          kind: "json" as const,
          label: "local",
          text: "{UNIQUE_INVALID_RECOVERY_SENTINEL",
        },
      ],
    };
    store.workspaceSave(draft);
    expect(readFileSync(file).includes(Buffer.from("UNIQUE_INVALID_RECOVERY_SENTINEL"))).toBe(true);
    store.close();
    const reopened = new ConnectionStore(file);
    expect(reopened.workspaceLoad()).toEqual(draft);
    reopened.workspaceSave({ ...draft, recoveryEnabled: false });
    expect(readFileSync(file).includes(Buffer.from("UNIQUE_INVALID_RECOVERY_SENTINEL"))).toBe(
      false,
    );
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
