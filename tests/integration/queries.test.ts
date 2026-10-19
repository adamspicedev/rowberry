import { afterEach, describe, expect, test, vi } from "vitest";
import * as connections from "../../src/database/connections";
import { QueryEngine } from "../../src/database/queries";
import { ConnectionProfileSchema, SessionIdSchema } from "../../src/shared/protocol";
for (const version of [14, 18])
  describe(`queries PostgreSQL ${version}`, () => {
    const engine = new QueryEngine();
    afterEach(() => engine.closeAll());
    async function tab(id = "a") {
      await engine.openTab(id, {
        sessionId: SessionIdSchema.parse(crypto.randomUUID()),
        generation: 1,
        password: "fixture-only-password",
        profile: ConnectionProfileSchema.parse({
          id: crypto.randomUUID(),
          name: "Query fixture",
          host: "localhost",
          port: 55400 + version,
          user: "fixture",
          database: "fixture",
          tls: { kind: "disable", acknowledged: true },
          environmentColor: "#123456",
        }),
      });
    }
    async function run(sql: string, id = "a") {
      const { queryId } = engine.start(id, sql);
      return engine.fetch(queryId);
    }
    test("suspended mutation outlives the driver read timeout without implicit commit", async () => {
      const realOpen = connections.openSession;
      const spy = vi.spyOn(connections, "openSession").mockImplementation(async (...args) => {
        const session = await realOpen(...args);
        const client = session.client;
        if (
          !("connectionParameters" in client) ||
          typeof client.connectionParameters !== "object" ||
          client.connectionParameters === null ||
          !("query_timeout" in client.connectionParameters)
        )
          throw new Error("Missing pg timer config");
        // Compress pg's inherited 35-second timer while retaining real sockets,
        // protocol dispatch, cursor and PostgreSQL transaction behavior.
        client.connectionParameters.query_timeout = 50;
        return session;
      });
      const schema = `query_lifetime_${crypto.randomUUID().replaceAll("-", "")}`;
      try {
        await tab();
        await tab("b");
        await run(`CREATE SCHEMA "${schema}"`, "b");
        await run(`CREATE TABLE "${schema}".writes(i int)`, "b");
        const { queryId } = engine.start(
          "a",
          `INSERT INTO "${schema}".writes SELECT i FROM generate_series(1,10) i RETURNING i`,
        );
        expect((await engine.fetch(queryId, 1)).done).toBe(false);
        await new Promise((r) => setTimeout(r, 150));
        expect(engine.state(queryId).status).toBe("running");
        expect((await engine.fetch(queryId, 1)).rows).toEqual([["2"]]);
        await engine.closeTab("a");
        expect((await run(`SELECT count(*) FROM "${schema}".writes`, "b")).rows).toEqual([["0"]]);
      } finally {
        spy.mockRestore();
        await engine.closeTab("a");
        await run(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`, "b");
      }
    });
    test("pending cancellation retains tab ownership until result close completes", async () => {
      await tab();
      const { queryId } = engine.start("a", "SELECT i FROM generate_series(1,10) i");
      await engine.fetch(queryId, 1);
      const realOpen = connections.openSession;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = vi.spyOn(connections, "openSession").mockImplementation(async (...args) => {
        await gate;
        return realOpen(...args);
      });
      const cancellation = engine.cancel(queryId);
      const closing = engine.close(queryId);
      try {
        await new Promise((r) => setTimeout(r, 30));
        expect(() => engine.start("a", "SELECT pg_sleep(1)")).toThrow();
        release();
        await Promise.all([cancellation, closing]);
        expect((await run("SELECT pg_sleep(0.1), 42")).rows).toEqual([["", "42"]]);
      } finally {
        release();
        await Promise.allSettled([cancellation, closing]);
        spy.mockRestore();
      }
    });
    test("server execution timeout and pre-fetch errors produce terminal states", async () => {
      await tab();
      await run("SET statement_timeout TO 50");
      const timed = await run("SELECT pg_sleep(1)");
      expect(timed.status).toBe("error");
      expect(timed.error).toContain("statement timeout");
      expect((await run("SELECT 1")).status).toBe("complete");
      const { queryId } = engine.start("a", "SELECT FROM invalid syntax");
      await expect.poll(() => engine.state(queryId).status).toBe("error");
      expect((await engine.fetch(queryId)).done).toBe(true);
      expect((await run("SELECT 2")).rows).toEqual([["2"]]);
    });
    test("raw SELECT pages retain OIDs, null and precision with bounded continuation", async () => {
      await tab();
      const { queryId } = engine.start(
        "a",
        "SELECT i, NULL::text, 12345678901234567890.123::numeric FROM generate_series(1,450) i",
      );
      const p = await engine.fetch(queryId);
      expect(p.rows).toHaveLength(200);
      expect(p.rows[0]).toEqual(["1", null, "12345678901234567890.123"]);
      expect(p.fields.map((f) => f.typeOid)).toEqual([23, 25, 1700]);
      expect(p.done).toBe(false);
      expect((await engine.fetch(queryId)).rows).toHaveLength(200);
      expect((await engine.fetch(queryId)).rows).toHaveLength(50);
    });
    test("extended parse rejects batching before any execution", async () => {
      await tab();
      expect((await run("CREATE TEMP TABLE should_not_exist(i int); SELECT 1")).status).toBe(
        "error",
      );
      expect((await run("SELECT to_regclass('pg_temp.should_not_exist')")).rows).toEqual([[null]]);
    });
    test("transaction errors abort until explicit rollback and tabs are isolated", async () => {
      await tab();
      await tab("b");
      expect((await run("BEGIN")).transaction).toBe("active");
      expect((await run("SELECT 1/0")).transaction).toBe("aborted");
      expect((await run("SELECT 1")).status).toBe("error");
      expect((await run("SELECT 1", "b")).transaction).toBe("idle");
      expect((await run("ROLLBACK")).transaction).toBe("idle");
      expect((await run("SELECT 1")).status).toBe("complete");
      expect((await run("-- comment only")).status).toBe("complete");
    });
    test("server cancellation permits subsequent work", async () => {
      await tab();
      const { queryId } = engine.start("a", "SELECT pg_sleep(20)");
      const pending = engine.fetch(queryId);
      await new Promise((r) => setTimeout(r, 100));
      await engine.cancel(queryId);
      expect((await pending).status).toBe("cancelled");
      expect((await run("SELECT 2")).rows).toEqual([["2"]]);
    });
    test("page byte cap explicitly rejects an oversized row", async () => {
      await tab();
      const p = await run("SELECT repeat('x', 17*1024*1024)");
      expect(p.status).toBe("limit");
      expect(p.rows).toEqual([]);
    });
    test("RETURNING never accumulates a backend output beyond its page budget", async () => {
      await tab();
      await run("CREATE TEMP TABLE returning_fixture (id integer)");
      const { queryId } = engine.start(
        "a",
        "INSERT INTO returning_fixture SELECT i FROM generate_series(1,100000) i RETURNING id",
      );
      let count = 0;
      for (;;) {
        const page = await engine.fetch(queryId, 1000);
        expect(page.rows.length).toBeLessThanOrEqual(1000);
        count += page.rows.length;
        if (page.done) {
          expect(page.status).toBe("complete");
          expect(page.rowCount).toBe(100000);
          break;
        }
      }
      expect(count).toBe(100000);
      expect((await run("SELECT count(*) FROM returning_fixture")).rows).toEqual([["100000"]]);
    });

    test("socket loss during mutation is unknown and never replayed", async () => {
      await tab();
      await tab("b");
      const pid = (await run("SELECT pg_backend_pid()")).rows[0]?.[0];
      expect(pid).toMatch(/^\d+$/);
      await run("CREATE TEMP TABLE mutation_fixture(i int)");
      const { queryId } = engine.start(
        "a",
        "INSERT INTO mutation_fixture VALUES (1) RETURNING pg_sleep(20)",
      );
      const pending = engine.fetch(queryId);
      await new Promise((r) => setTimeout(r, 100));
      await run(`SELECT pg_terminate_backend(${Number(pid)})`, "b");
      expect((await pending).status).toBe("unknown");
      expect(() => engine.start("a", "SELECT 1")).toThrow();
    });
    test("explicit rollback undoes writes and commit acknowledges persistence within a tab", async () => {
      await tab();
      await run("CREATE TEMP TABLE transaction_fixture(i int)");
      await run("BEGIN");
      await run("INSERT INTO transaction_fixture VALUES (1)");
      await run("ROLLBACK");
      expect((await run("SELECT count(*) FROM transaction_fixture")).rows).toEqual([["0"]]);
      await run("BEGIN");
      await run("INSERT INTO transaction_fixture VALUES (2)");
      expect((await run("COMMIT")).command).toBe("COMMIT");
      expect((await run("SELECT * FROM transaction_fixture")).rows).toEqual([["2"]]);
    });
    test("large SELECT retains only the current bounded page and closes suspended portals", async () => {
      await tab();
      const { queryId } = engine.start(
        "a",
        "SELECT i, repeat('x',1024) FROM generate_series(1,10000000) i",
      );
      const memory = process.memoryUsage().heapUsed;
      for (let i = 0; i < 120; i++) {
        const page = await engine.fetch(queryId, 1000);
        expect(page.rows).toHaveLength(1000);
        expect(page.rows[0]?.[0]).toBe(String(i * 1000 + 1));
        expect(engine.state(queryId).rows).toEqual([]);
      }
      // This reads >120 MiB from a >10 GiB logical result without retaining it.
      // Allow GC/runtime variance but reject accumulating all those pages.
      console.info(
        JSON.stringify({
          version,
          fetchedRows: 120000,
          heapBefore: memory,
          heapAfter: process.memoryUsage().heapUsed,
        }),
      );
      expect(process.memoryUsage().heapUsed - memory).toBeLessThan(80 * 1024 * 1024);
      await engine.close(queryId);
      expect((await run("SELECT 1")).status).toBe("complete");
    });
    test("COPY transport cannot crash the worker or accumulate stdout", async () => {
      await tab();
      await run("CREATE TEMP TABLE copy_fixture(i int)");
      const input = await run("COPY copy_fixture FROM STDIN");
      expect(input.status).toBe("unknown");
      expect(input.error).toContain("COPY streaming is unsupported");
      await tab("b");
      const output = await run("COPY (SELECT i FROM generate_series(1,10000000) i) TO STDOUT", "b");
      expect(output.status).toBe("unknown");
      expect(output.rows).toEqual([]);
    });
    test("tab closure rolls back open work and invalidates queries", async () => {
      await tab();
      await tab("b");
      const schema = `query_close_${crypto.randomUUID().replaceAll("-", "")}`;
      await run(`CREATE SCHEMA "${schema}"`, "b");
      try {
        await run(`CREATE TABLE "${schema}".writes (i int)`, "b");
        await run("BEGIN");
        await run(`INSERT INTO "${schema}".writes VALUES (1)`);
        const { queryId } = engine.start("a", "SELECT pg_sleep(20)");
        const pending = engine.fetch(queryId);
        await new Promise((r) => setTimeout(r, 100));
        await engine.closeTab("a");
        expect((await pending).status).toBe("unknown");
        expect(() => engine.start("a", "SELECT 1")).toThrow();
        expect((await run(`SELECT count(*) FROM "${schema}".writes`, "b")).rows).toEqual([["0"]]);
      } finally {
        await run(`DROP SCHEMA "${schema}" CASCADE`, "b");
      }
    });
  });
