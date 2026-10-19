import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { _electron, type ElectronApplication } from "@playwright/test";
import { build } from "esbuild";
import { z } from "zod";
import { createServer, type Socket } from "node:net";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openSession } from "../../src/database/connections";
import { ConnectionProfileSchema, SessionIdSchema } from "../../src/shared/protocol";
import type { ResolvedConnection } from "../../src/database/types";
import { acceptSessionEvent } from "../../src/renderer/app/session-state";
import type {} from "../fixtures/postgres/utility-harness";
// The harness module is bundled as Electron main, never executed by Vitest.
const fixture = z
  .object({ directory: z.string() })
  .parse(
    JSON.parse(
      readFileSync(process.env.DBAPP_POSTGRES_FIXTURES ?? "/tmp/dbapp-task3-fixtures.json", "utf8"),
    ),
  );
const directory: string = fixture.directory;
function config(version: number, tls = false): ResolvedConnection {
  return {
    sessionId: SessionIdSchema.parse(crypto.randomUUID()),
    generation: 1,
    password: "fixture-only-password",
    profile: ConnectionProfileSchema.parse({
      id: crypto.randomUUID(),
      name: "Disposable fixture",
      host: "localhost",
      port: 55400 + version,
      database: "fixture",
      user: "fixture",
      tls: tls
        ? { kind: "verify-full", caPath: path.join(directory, "ca.crt") }
        : { kind: "disable", acknowledged: true },
      environmentColor: "#123456",
    }),
  };
}
for (const version of [14, 18])
  describe(`PostgreSQL ${version}`, () => {
    test("valid credentials and text parsers retain precision, time, JSON, binary, arrays and NULL", async () => {
      const session = await openSession(config(version));
      try {
        expect(session.serverVersion).toMatch(new RegExp(`^${version}\\.`));
        expect(session.transaction).toBe("idle");
        const result = await session.client.query(
          "SELECT 9223372036854775807::bigint AS bigint, 12345678901234567890.123456789::numeric AS numeric, '{\"n\":9007199254740993,\"n\":2}'::json AS json, '{\"n\":9007199254740993}'::jsonb AS jsonb, '2026-10-20 12:34:56.123456'::timestamp AS timestamp, '12:34:56.123456+13'::timetz AS time, decode('abcd','hex') AS bytes, ARRAY[9223372036854775807::bigint] AS array, NULL AS null",
        );
        expect(result.rows[0]).toEqual({
          bigint: "9223372036854775807",
          numeric: "12345678901234567890.123456789",
          json: '{"n":9007199254740993,"n":2}',
          jsonb: '{"n": 9007199254740993}',
          timestamp: "2026-10-20 12:34:56.123456",
          time: "12:34:56.123456+13",
          bytes: "\\xabcd",
          array: "{9223372036854775807}",
          null: null,
        });
      } finally {
        await session.client.end();
      }
    });
    test("wrong password is rejected with no credential or server detail in error", async () => {
      await expect(
        openSession({ ...config(version), password: "sentinel-wrong-password" }),
      ).rejects.toThrow(
        /^Database connection failed\. Check credentials, TLS settings and server availability\.$/,
      );
    });
    test("trusted TLS verifies server identity and negotiates encryption", async () => {
      const session = await openSession(config(version, true));
      try {
        expect(
          (await session.client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()"))
            .rows[0],
        ).toEqual({ ssl: "t" });
      } finally {
        await session.client.end();
      }
    });
    test("untrusted server certificate is rejected", async () => {
      const input = config(version);
      input.profile.tls = { kind: "verify-full" };
      await expect(openSession(input)).rejects.toThrow("Database connection failed");
    });
    test("client certificate authentication succeeds and absence is rejected", async () => {
      const input = config(version, true);
      input.profile.user = "certfixture";
      input.password = null;
      await expect(openSession(input)).rejects.toThrow("Database connection failed");
      input.profile.tls = {
        kind: "verify-full",
        caPath: path.join(directory, "ca.crt"),
        client: {
          certPath: path.join(directory, "client.crt"),
          keyPath: path.join(directory, "client.key"),
        },
      };
      const session = await openSession(input);
      try {
        expect((await session.client.query("SELECT current_user")).rows[0]).toEqual({
          current_user: "certfixture",
        });
      } finally {
        await session.client.end();
      }
    });
  });
test("connect timeout closes a socket stalled before authentication", async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.resume();
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  const input = config(14);
  input.profile.host = "127.0.0.1";
  input.profile.port = address.port;
  input.connectTimeoutMs = 150;
  try {
    const start = Date.now();
    await expect(openSession(input)).rejects.toThrow("Database connection failed");
    expect(Date.now() - start).toBeLessThan(2000);
    await expect.poll(() => sockets.size).toBe(0);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
describe("real Electron utility-process transport", () => {
  let application: ElectronApplication;
  let userData: string;
  beforeAll(async () => {
    await build({
      entryPoints: ["tests/fixtures/postgres/utility-harness.ts"],
      outfile: "dist/test-utility-harness.cjs",
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
    });
    userData = mkdtempSync(path.join(tmpdir(), "dbapp-session-test-"));
    const env = Object.fromEntries(
      Object.entries(process.env).flatMap(([key, value]) =>
        value !== undefined && key !== "ELECTRON_RUN_AS_NODE" ? [[key, value]] : [],
      ),
    );
    application = await _electron.launch({
      args: [path.resolve("dist/test-utility-harness.cjs"), `--user-data-dir=${userData}`],
      env,
    });
    expect(
      await application.evaluate(async ({ app }) => {
        await app.whenReady();
        return Boolean(globalThis.sessionHarness);
      }),
    ).toBe(true);
  });
  afterAll(async () => {
    await application?.close();
    if (userData) rmSync(userData, { recursive: true, force: true });
  });
  for (const version of [14, 18])
    test(`verified TLS and client authentication through actual utility worker (${version})`, async () => {
      const input = config(version, true);
      const result = await application.evaluate(async (_, input) => {
        const result = await globalThis.sessionHarness.open(input);
        globalThis.sessionHarness.stop();
        return result;
      }, input);
      expect(result.serverVersion).toMatch(new RegExp(`^${version}\\.`));
      input.profile.tls = { kind: "verify-full" };
      expect(
        await application.evaluate(async (_, input) => {
          try {
            await globalThis.sessionHarness.open(input);
            return "unexpected";
          } catch {
            return "rejected";
          }
        }, input),
      ).toBe("rejected");
      input.profile.user = "certfixture";
      input.password = null;
      input.profile.tls = {
        kind: "verify-full",
        caPath: path.join(directory, "ca.crt"),
        client: {
          certPath: path.join(directory, "client.crt"),
          keyPath: path.join(directory, "client.key"),
        },
      };
      expect(
        await application.evaluate(async (_, input) => {
          const result = await globalThis.sessionHarness.open(input);
          globalThis.sessionHarness.stop();
          return result.serverVersion;
        }, input),
      ).toMatch(new RegExp(`^${version}\\.`));
    });
  test("a pending network handshake can be disconnected and its socket closes", async () => {
    let accepted = 0;
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      accepted++;
      sockets.add(socket);
      socket.resume();
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error();
    const input = config(14);
    input.profile.host = "127.0.0.1";
    input.profile.port = address.port;
    try {
      const outcome = await application.evaluate(async (_, input) => {
        const pending = globalThis.sessionHarness.open(input).then(
          () => "unexpected",
          () => "cancelled",
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        const event = globalThis.sessionHarness.events.at(-1);
        if (!event || event.kind !== "sessions.state") throw new Error();
        globalThis.sessionHarness.close(event.sessionId);
        return pending;
      }, input);
      expect(outcome).toBe("cancelled");
      expect(accepted).toBe(1);
      await expect.poll(() => sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  test("worker crash emits disconnected, closes server backend and permits reconnect", async () => {
    const input = config(14);
    await application.evaluate(async (_, input) => {
      await globalThis.sessionHarness.open(input);
      globalThis.sessionHarness.crash();
    }, input);
    await expect
      .poll(() => application.evaluate(() => globalThis.sessionHarness.events.at(-1)))
      .toMatchObject({ state: "disconnected" });
    const observer = await openSession(config(14));
    try {
      await expect
        .poll(
          async () =>
            (
              await observer.client.query(
                "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'dbapp' AND pid <> pg_backend_pid()",
              )
            ).rows[0]?.count,
        )
        .toBe("0");
    } finally {
      await observer.client.end();
    }
    await application.evaluate(async (_, input) => {
      await globalThis.sessionHarness.open(input);
      globalThis.sessionHarness.stop();
    }, input);
  });
  test("switching invalidates slow credential resolution and renderer ignores an old generation", async () => {
    const result = await application.evaluate(async (_, input) => {
      const old = globalThis.sessionHarness.open(input, 500).then(
        () => "unexpected",
        () => "cancelled",
      );
      const current = await globalThis.sessionHarness.open(input);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const events = [...globalThis.sessionHarness.events];
      globalThis.sessionHarness.stop();
      return { old: await old, current, events };
    }, config(18));
    expect(result.old).toBe("cancelled");
    const latest = result.events.at(-1);
    expect(latest).toMatchObject({ state: "connected", generation: result.current.generation });
    if (!latest || latest.kind !== "sessions.state") throw new Error();
    const old = {
      ...latest,
      generation: latest.generation - 1,
      state: "disconnected",
    } satisfies typeof latest;
    expect(acceptSessionEvent(latest, old)).toBe(latest);
  });
  test("close while vault is pending returns immediately and never starts a late worker", async () => {
    const result = await application.evaluate(async (_, input) => {
      const pending = globalThis.sessionHarness.open(input, 300).then(
        () => "unexpected",
        () => "cancelled",
      );
      const event = globalThis.sessionHarness.events.at(-1);
      if (!event || event.kind !== "sessions.state") throw new Error();
      const start = Date.now();
      globalThis.sessionHarness.close(event.sessionId);
      const outcome = await pending;
      const elapsed = Date.now() - start;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { outcome, elapsed, event: globalThis.sessionHarness.events.at(-1) };
    }, config(14));
    expect(result.outcome).toBe("cancelled");
    expect(result.elapsed).toBeLessThan(200);
    expect(result.event).toMatchObject({ state: "disconnected" });
  });
});
