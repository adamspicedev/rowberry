import { WorkspaceSchema, emptyWorkspace, type Workspace } from "../shared/workspace";
import { DatabaseSync } from "node:sqlite";
import {
  ConnectionProfileSchema,
  type ConnectionProfile,
  type ConnectionId,
} from "../shared/protocol";
const migrations = [
  "CREATE TABLE connections (id TEXT PRIMARY KEY, profile TEXT NOT NULL, credential_ref INTEGER NOT NULL DEFAULT 0, credential_enabled INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE saved_queries (id TEXT PRIMARY KEY, name TEXT NOT NULL, sql TEXT NOT NULL)",
  "CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)",
];
export function migrate(db: DatabaseSync, steps: readonly string[] = migrations): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (typeof version !== "number" || version > steps.length) throw new Error();
    for (let index = version; index < steps.length; index++) {
      const sql = steps[index];
      if (sql === undefined) throw new Error();
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    }
    db.exec("COMMIT");
  } catch {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw new Error("Local storage could not be updated.");
  }
}
export class ConnectionStore {
  private readonly db: DatabaseSync;
  constructor(filename: string, openDatabase = (name: string) => new DatabaseSync(name)) {
    this.db = openDatabase(filename);
    try {
      this.db.exec("PRAGMA busy_timeout = 3000; PRAGMA secure_delete = ON");
      migrate(this.db);
    } catch {
      this.db.close();
      throw new Error("Local storage could not be updated.");
    }
  }
  workspaceLoad(): Workspace {
    const row = this.db.prepare("SELECT state FROM workspace WHERE id=1").get();
    return row ? WorkspaceSchema.parse(JSON.parse(String(row.state))) : emptyWorkspace();
  }
  workspaceSave(input: unknown): void {
    const state = WorkspaceSchema.parse(input);
    if (!state.recoveryEnabled) {
      state.sql = [];
      state.drafts = [];
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO workspace(id,state) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
        )
        .run(JSON.stringify(state));
      this.db.exec("COMMIT");
    } catch {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw new Error(
        "Workspace could not be saved. Free disk space and retry; keep this window open to preserve drafts.",
      );
    }
  }
  savedList(offset: number) {
    const items = this.db
      .prepare("SELECT id,name FROM saved_queries ORDER BY name,id LIMIT 20 OFFSET ?")
      .all(offset);
    return { items, nextOffset: items.length === 20 ? offset + 20 : null };
  }
  savedGet(id: string) {
    return this.db.prepare("SELECT id,name,sql FROM saved_queries WHERE id=?").get(id);
  }
  savedSave(id: string, name: string, sql: string) {
    this.db
      .prepare(
        "INSERT INTO saved_queries(id,name,sql) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sql=excluded.sql",
      )
      .run(id, name, sql);
  }
  list(offset = 0): ConnectionProfile[] {
    return this.db
      .prepare("SELECT profile FROM connections ORDER BY id LIMIT 20 OFFSET ?")
      .all(offset)
      .map((row) => {
        if (typeof row.profile !== "string") throw new Error("Invalid local metadata.");
        return ConnectionProfileSchema.parse(JSON.parse(row.profile));
      });
  }
  get(id: ConnectionId): ConnectionProfile {
    const row = this.db.prepare("SELECT profile FROM connections WHERE id = ?").get(id);
    if (typeof row?.profile !== "string") throw new Error("Connection does not exist.");
    return ConnectionProfileSchema.parse(JSON.parse(row.profile));
  }
  has(id: ConnectionId): boolean {
    return !!this.db.prepare("SELECT id FROM connections WHERE id = ?").get(id);
  }
  save(input: unknown): ConnectionProfile {
    const profile = ConnectionProfileSchema.parse(input);
    this.db
      .prepare(
        "INSERT INTO connections(id, profile) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile",
      )
      .run(profile.id, JSON.stringify(profile));
    return profile;
  }
  credentialState(id: ConnectionId) {
    const row = this.db
      .prepare("SELECT credential_ref, credential_enabled FROM connections WHERE id=?")
      .get(id);
    return { referenced: row?.credential_ref === 1, enabled: row?.credential_enabled === 1 };
  }
  markCredential(id: ConnectionId, enabled: boolean, referenced = true): void {
    this.db
      .prepare("UPDATE connections SET credential_enabled=?, credential_ref=? WHERE id=?")
      .run(Number(enabled), Number(referenced), id);
  }
  delete(id: ConnectionId): void {
    this.db.prepare("DELETE FROM connections WHERE id=?").run(id);
  }
  close(): void {
    this.db.close();
  }
}
