import { afterEach, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConnectionStore, migrate } from "../../src/main/store";
import { ConnectionService } from "../../src/main/connections";
import { ConnectionProfileSchema } from "../../src/shared/protocol";
import type { CredentialStore } from "../../src/main/credentials";
const dirs: string[] = [];
function file() {
  const dir = mkdtempSync(path.join(tmpdir(), "dbapp-store-"));
  dirs.push(dir);
  return path.join(dir, "profiles.sqlite");
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const profile = ConnectionProfileSchema.parse({
  id: "d56a7cfe-2834-4fa0-b912-856c5625d65a",
  name: "Local",
  host: "localhost",
  port: 5432,
  database: "app",
  user: "postgres",
  tls: { kind: "verify-full" },
  environmentColor: "#7c3aed",
});
const sentinel = "PASSWORD_SENTINEL_7e@ss";
function vault(available = true) {
  const values = new Map<string, string>();
  const store: CredentialStore = {
    available: async () => available,
    get: async (id) => values.get(id) ?? null,
    set: async (id, value) => {
      values.set(id, value);
    },
    delete: async (id) => {
      values.delete(id);
    },
  };
  return { store, values };
}
test("migration batch rolls back schema and version after a later migration fails", () => {
  const db = new DatabaseSync(file());
  expect(() => migrate(db, ["CREATE TABLE first (id TEXT)", "invalid SQL"])).toThrow(
    "Local storage could not be updated.",
  );
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='first'").all()).toEqual([]);
  expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 0 });
  db.close();
});
test("metadata survives restart and passwords never enter SQLite or replies", async () => {
  const filename = file();
  const store = new ConnectionStore(filename);
  const credentials = vault();
  const service = new ConnectionService(store, credentials.store);
  await service.save(profile);
  const reply = await service.submitSecret(profile.id, sentinel, true);
  expect(reply).toEqual({ storage: "secure" });
  expect(credentials.values.get(profile.id)).toBe(sentinel);
  expect(JSON.stringify(await service.list())).not.toContain(sentinel);
  store.close();
  expect(readFileSync(filename).includes(Buffer.from(sentinel))).toBe(false);
  const reopened = new ConnectionStore(filename);
  expect(reopened.list()).toEqual([profile]);
  reopened.close();
});
test("deleting a profile removes saved and session credentials", async () => {
  const store = new ConnectionStore(file());
  const credentials = vault();
  const service = new ConnectionService(store, credentials.store);
  await service.save(profile);
  await service.submitSecret(profile.id, sentinel, true);
  await service.delete(profile.id);
  expect(credentials.values.has(profile.id)).toBe(false);
  expect(await service.resolveSecret(profile.id)).toBeNull();
  expect(store.list()).toEqual([]);
  store.close();
});
test("unavailable OS vault keeps passwords only for this session", async () => {
  const filename = file();
  const store = new ConnectionStore(filename);
  const credentials = vault(false);
  const service = new ConnectionService(store, credentials.store);
  await service.save(profile);
  expect(await service.submitSecret(profile.id, sentinel, true)).toEqual({ storage: "session" });
  expect(credentials.values.size).toBe(0);
  expect(await service.resolveSecret(profile.id)).toBe(sentinel);
  const restarted = new ConnectionService(store, credentials.store);
  expect(await restarted.resolveSecret(profile.id)).toBeNull();
  store.close();
  expect(readFileSync(filename).includes(Buffer.from(sentinel))).toBe(false);
});
test("credential errors are redacted and failed deletion retains the profile for retry", async () => {
  const store = new ConnectionStore(file());
  const credentials = vault();
  credentials.store.delete = async () => {
    throw new Error(sentinel);
  };
  const service = new ConnectionService(store, credentials.store);
  await service.save(profile);
  await service.submitSecret(profile.id, sentinel, true);
  await expect(service.delete(profile.id)).rejects.toThrow("Credential operation failed.");
  expect(store.list()).toEqual([profile]);
  store.close();
});
test("session-only replacement never resurrects a previously saved credential", async () => {
  const filename = file();
  const credentials = vault();
  const store = new ConnectionStore(filename);
  const service = new ConnectionService(store, credentials.store);
  await service.save(profile);
  await service.submitSecret(profile.id, "old-secret", true);
  await service.submitSecret(profile.id, sentinel, false);
  expect(await service.resolveSecret(profile.id)).toBe(sentinel);
  store.close();
  const reopened = new ConnectionStore(filename);
  const restarted = new ConnectionService(reopened, credentials.store);
  expect(await restarted.resolveSecret(profile.id)).toBeNull();
  await restarted.delete(profile.id);
  expect(credentials.values.size).toBe(0);
  reopened.close();
});
test("failed native write returns only session status and never the native error", async () => {
  const credentials = vault();
  credentials.store.set = async () => {
    throw new Error(sentinel);
  };
  const store = new ConnectionStore(file());
  const service = new ConnectionService(store, credentials.store);
  await service.save(profile);
  expect(await service.submitSecret(profile.id, sentinel, true)).toEqual({ storage: "session" });
  expect(await service.resolveSecret(profile.id)).toBe(sentinel);
  expect(JSON.stringify(await service.list())).not.toContain(sentinel);
  store.close();
});
test("profiles reject secret fields and connection URLs before writing metadata", () => {
  const store = new ConnectionStore(file());
  expect(() => store.save({ ...profile, password: sentinel })).toThrow();
  expect(() => store.save({ ...profile, host: `postgres://user:${sentinel}@host` })).toThrow();
  expect(store.list()).toEqual([]);
  store.close();
});
test("all profiles remain reachable through bounded list pages", () => {
  const store = new ConnectionStore(file());
  for (let i = 0; i < 21; i++)
    store.save({ ...profile, id: crypto.randomUUID(), name: `Connection ${i}` });
  expect(store.list()).toHaveLength(20);
  expect(store.list(20)).toHaveLength(1);
  store.close();
});
test("Unicode metadata pages stay under the IPC byte limit without losing profiles", async () => {
  const { bounded } = await import("../../src/shared/protocol");
  const store = new ConnectionStore(file());
  const service = new ConnectionService(store, vault(false).store);
  for (let i = 0; i < 20; i++)
    store.save({
      ...profile,
      id: crypto.randomUUID(),
      database: "💾".repeat(64),
      user: "💾".repeat(64),
      tls: {
        kind: "verify-full",
        caPath: "💾".repeat(256),
        client: { certPath: "💾".repeat(256), keyPath: "💾".repeat(256) },
      },
    });
  let offset: number | null = 0;
  let total = 0;
  do {
    const page = await service.list(offset);
    expect(
      bounded({ ok: true, requestId: "x".repeat(128), kind: "connections.list", data: page }),
    ).toBe(true);
    total += page.profiles.length;
    offset = page.nextOffset;
  } while (offset !== null);
  expect(total).toBe(20);
  store.close();
});
