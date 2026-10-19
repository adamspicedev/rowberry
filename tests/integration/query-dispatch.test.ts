import { Client } from "pg";
import { test, expect } from "vitest";
import { QueryDispatch } from "../../src/database/query-dispatch";
import {
  ConnectionProfileSchema,
  QueryCommandSchema,
  SessionIdSchema,
} from "../../src/shared/protocol";
for (const version of [14, 18])
  test(`private dispatcher ownership, first-fetch cancellation and tab cap PG${version}`, async () => {
    const owner = { sessionId: SessionIdSchema.parse(crypto.randomUUID()), generation: 1 };
    const dispatch = new QueryDispatch({
      ...owner,
      password: "fixture-only-password",
      profile: ConnectionProfileSchema.parse({
        id: crypto.randomUUID(),
        name: "Dispatch fixture",
        host: "localhost",
        port: 55400 + version,
        user: "fixture",
        database: "fixture",
        tls: { kind: "disable", acknowledged: true },
        environmentColor: "#123456",
      }),
    });
    const tabId = crypto.randomUUID();
    const request = (value: Record<string, unknown>) =>
      dispatch.request(
        QueryCommandSchema.parse({ ...owner, tabId, requestId: crypto.randomUUID(), ...value }),
      );
    try {
      expect((await request({ kind: "queries.openTab", generation: 2 })).ok).toBe(false);
      expect((await request({ kind: "queries.openTab" })).ok).toBe(true);
      const started = await request({ kind: "queries.start", sql: "SELECT pg_sleep(20)" });
      if (!started.ok || started.kind !== "queries.start") throw new Error("No query");
      const queryId = started.data.queryId;
      expect(await request({ kind: "queries.start", sql: "SELECT 1" })).toMatchObject({
        ok: false,
        error: { code: "QUERY_UNAVAILABLE" },
      });
      expect(
        (await request({ kind: "queries.fetch", tabId: crypto.randomUUID(), queryId })).ok,
      ).toBe(false);
      const fetching = request({ kind: "queries.fetch", queryId });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect((await request({ kind: "queries.cancel", queryId })).ok).toBe(true);
      const page = await fetching;
      expect(page.ok && page.kind === "queries.fetch" && page.data.status).toBe("cancelled");
      const backend = await request({ kind: "queries.start", sql: "SELECT pg_backend_pid()" });
      if (!backend.ok || backend.kind !== "queries.start") throw new Error("Missing backend query");
      const identity = await request({ kind: "queries.fetch", queryId: backend.data.queryId });
      if (!identity.ok || identity.kind !== "queries.fetch")
        throw new Error("Missing backend identity");
      const control = new Client({
        host: "localhost",
        port: 55400 + version,
        user: "fixture",
        database: "fixture",
        password: "fixture-only-password",
      });
      await control.connect();
      try {
        await control.query("SELECT pg_terminate_backend($1)", [
          Number(identity.data.rows[0]?.[0]),
        ]);
      } finally {
        await control.end();
      }
      await expect
        .poll(() => request({ kind: "queries.start", sql: "SELECT 1" }))
        .toMatchObject({ ok: false, error: { code: "QUERY_SESSION_CLOSED" } });
      for (let i = 0; i < 15; i++)
        expect((await request({ kind: "queries.openTab", tabId: crypto.randomUUID() })).ok).toBe(
          true,
        );
      expect((await request({ kind: "queries.openTab", tabId: crypto.randomUUID() })).ok).toBe(
        false,
      );
    } finally {
      await dispatch.closeAll();
    }
  });
