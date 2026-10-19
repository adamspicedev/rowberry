import { DatabaseSync } from "node:sqlite";
import {
  ConnectionProfileSchema,
  type ConnectionProfile,
  type ConnectionId,
} from "../shared/protocol";
const migrations = [
  "CREATE TABLE connections (id TEXT PRIMARY KEY, profile TEXT NOT NULL, credential_ref INTEGER NOT NULL DEFAULT 0, credential_enabled INTEGER NOT NULL DEFAULT 0)",
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
    db.exec("ROLLBACK");
    throw new Error("Local storage could not be updated.");
  }
}
export class ConnectionStore {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec("PRAGMA busy_timeout = 3000");
      migrate(this.db);
    } catch {
      this.db.close();
      throw new Error("Local storage could not be updated.");
    }
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
