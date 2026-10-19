import { createServer, connect as connectSocket, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openSession, type Session } from "../../src/database/connections";
import { RowBrowser } from "../../src/database/rows";
import { introspect } from "../../src/database/introspection";
import { ConnectionProfileSchema, SessionIdSchema } from "../../src/shared/protocol";
for (const version of [14, 18])
  describe(`writes PostgreSQL ${version}`, () => {
    let session: Session;
    let observer: Session;
    async function connect(port: number) {
      return openSession({
        sessionId: SessionIdSchema.parse(crypto.randomUUID()),
        generation: 1,
        password: "fixture-only-password",
        profile: ConnectionProfileSchema.parse({
          id: crypto.randomUUID(),
          name: "Write fixture",
          host: "localhost",
          port,
          user: "fixture",
          database: "fixture",
          tls: { kind: "disable", acknowledged: true },
          environmentColor: "#123456",
        }),
      });
    }
    let browser: RowBrowser;
    let tableId: string;
    beforeAll(async () => {
      session = await connect(55400 + version);
      observer = await connect(55400 + version);
      await session.client.query(
        `DROP SCHEMA IF EXISTS "write fixture" CASCADE; CREATE SCHEMA "write fixture"; CREATE TABLE "write fixture"."quoted table" ("part A" integer, "part B" text, value text, doc json, calculated integer GENERATED ALWAYS AS ("part A"+1) STORED, PRIMARY KEY ("part A","part B")); INSERT INTO "write fixture"."quoted table" VALUES (1,'a','original','{}'),(2,'b','neighbour','{}');`,
      );
      const table = (await introspect(session)).tables.find(
        (t) => t.schema === "write fixture" && t.name === "quoted table",
      );
      if (!table) throw Error("Missing fixture");
      tableId = table.id;
      browser = new RowBrowser(session);
    });
    afterAll(async () => {
      if (session) {
        await session.client.query('DROP SCHEMA IF EXISTS "write fixture" CASCADE');
        await session.client.end();
        await observer.client.end();
      }
    });
    async function page() {
      return browser.fetch({ tableId });
    }
    test("guarded composite key change preserves exact JSON and refreshes tokens", async () => {
      const before = await page();
      const target = before.rows[0]?.target;
      if (!target) throw Error("No target");
      const saved = await browser.save({
        changes: [
          {
            target,
            values: {
              "part A": "3",
              doc: '{"n":9007199254740993,"d":1.234567890123456789}',
              value: null,
            },
          },
        ],
      });
      expect(saved.kind).toBe("committed");
      const actual = await observer.client.query(
        'SELECT "part A"::text AS id,value,doc::text FROM "write fixture"."quoted table" ORDER BY "part A"',
      );
      expect(actual.rows).toEqual([
        { id: "2", value: "neighbour", doc: "{}" },
        { id: "3", value: null, doc: '{"n":9007199254740993,"d":1.234567890123456789}' },
      ]);
      expect((await browser.save({ changes: [{ target, values: { value: "stale" } }] })).kind).toBe(
        "failed",
      );
    });
    test("large escape-heavy JSON saves exactly; refreshed token remains usable", async () => {
      const target = (await page()).rows[0]?.target;
      if (!target) throw Error("No target");
      const doc = '"' + "\\n".repeat(1024 * 1024) + '"';
      const saved = await browser.save({ changes: [{ target, values: { doc } }] });
      expect(saved.kind).toBe("committed");
      expect(
        (
          await observer.client.query(
            'SELECT doc::text FROM "write fixture"."quoted table" WHERE "part A"=2',
          )
        ).rows[0]?.doc,
      ).toBe(doc);
      if (saved.kind !== "committed") throw Error("Not committed");
      const next = saved.rows[0]?.row.target;
      if (!next) throw Error("No refreshed target");
      expect(
        (await browser.save({ changes: [{ target: next, values: { doc: "{}" } }] })).kind,
      ).toBe("committed");
      const fresh = (await page()).rows[0]?.target;
      if (!fresh) throw Error("No target");
      const over = await browser.save({
        changes: [{ target: fresh, values: { doc: '"' + "x".repeat(32 * 1024 * 1024) + '"' } }],
      });
      expect(over.kind).toBe("failed");
      if (over.kind !== "committed") expect(over.message).toContain("32 MiB");
    });
    test("two browser versions conflict and roll back all rows", async () => {
      const old = await page();
      const targets = old.rows.map((r) => r.target);
      if (!targets[0] || !targets[1]) throw Error("No target");
      await observer.client.query(
        'UPDATE "write fixture"."quoted table" SET value=\'external\' WHERE "part A"=3',
      );
      const result = await browser.save({
        changes: [
          { target: targets[0], values: { value: "must roll back" } },
          { target: targets[1], values: { value: "conflicting" } },
        ],
      });
      expect(result.kind).toBe("conflict");
      const actual = await observer.client.query(
        'SELECT value FROM "write fixture"."quoted table" WHERE "part A"=2',
      );
      expect(actual.rows[0]?.value).toBe("neighbour");
    });
    test("generated fields and duplicate target batches fail without writes", async () => {
      const target = (await page()).rows[0]?.target;
      if (!target) throw Error("No target");
      expect(
        (await browser.save({ changes: [{ target, values: { calculated: "9" } }] })).kind,
      ).toBe("failed");
      expect(
        (
          await browser.save({
            changes: [
              { target, values: { value: "a" } },
              { target, values: { value: "b" } },
            ],
          })
        ).kind,
      ).toBe("failed");
    });
    test("invalid and duplicate JSON, type changes, SQL errors roll back", async () => {
      let target = (await page()).rows[0]?.target;
      if (!target) throw Error("No target");
      for (const doc of ['{"a":1,"a":2}', '{"a":'])
        expect((await browser.save({ changes: [{ target, values: { doc } }] })).kind).toBe(
          "failed",
        );
      const all = await page();
      const second = all.rows[1]?.target;
      target = all.rows[0]?.target;
      if (!target || !second) throw Error("No targets");
      expect(
        (
          await browser.save({
            changes: [
              { target, values: { value: "rollback" } },
              { target: second, values: { "part A": "not integer" } },
            ],
          })
        ).kind,
      ).toBe("failed");
      expect(
        (
          await observer.client.query(
            'SELECT value FROM "write fixture"."quoted table" WHERE "part A"=2',
          )
        ).rows[0]?.value,
      ).toBe("neighbour");
      await observer.client.query(
        'ALTER TABLE "write fixture"."quoted table" ALTER COLUMN value TYPE varchar(200)',
      );
      const changed = await browser.save({
        changes: [{ target, values: { value: "wrong schema" } }],
      });
      expect(changed.kind).toBe("failed");
    });
    test("AFTER trigger values and version are refreshed before issuing target", async () => {
      await observer.client.query(
        `CREATE TABLE "write fixture".triggered(id integer PRIMARY KEY,value text);INSERT INTO "write fixture".triggered VALUES(1,'original');CREATE FUNCTION "write fixture".refresh_value() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF pg_trigger_depth()=1 THEN UPDATE "write fixture".triggered SET value=NEW.value||'!' WHERE id=NEW.id; END IF; RETURN NEW; END $$;CREATE TRIGGER refresh_value AFTER UPDATE ON "write fixture".triggered FOR EACH ROW EXECUTE FUNCTION "write fixture".refresh_value();`,
      );
      const t = (await introspect(session)).tables.find(
        (t) => t.schema === "write fixture" && t.name === "triggered",
      );
      if (!t) throw Error("Missing trigger table");
      const target = (await browser.fetch({ tableId: t.id })).rows[0]?.target;
      if (!target) throw Error("No target");
      const result = await browser.save({ changes: [{ target, values: { value: "first" } }] });
      expect(result.kind).toBe("committed");
      if (result.kind !== "committed") throw Error("Not committed");
      expect(result.rows[0]?.row.cells[1]?.text).toBe("first!");
      const next = result.rows[0]?.row.target;
      if (!next) throw Error("No target");
      expect(
        (await browser.save({ changes: [{ target: next, values: { value: "second" } }] })).kind,
      ).toBe("committed");
      expect(
        (await observer.client.query('SELECT value FROM "write fixture".triggered')).rows[0]?.value,
      ).toBe("second!");
    });
    for (const deferred of [false, true])
      test(`${deferred ? "deferred constraint" : "later row AFTER"} trigger refreshes final batch baseline`, async () => {
        const name = deferred ? "deferred_final" : "batch_final";
        await observer.client.query(
          `CREATE TABLE "write fixture".${name}(id integer PRIMARY KEY,value text);INSERT INTO "write fixture".${name} VALUES(1,'one'),(2,'two');CREATE FUNCTION "write fixture".${name}_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${deferred ? `IF NEW.value NOT LIKE '%!' THEN UPDATE "write fixture".${name} SET value=NEW.value||'!' WHERE id=NEW.id; END IF;` : `IF NEW.id=2 THEN UPDATE "write fixture".${name} SET value='changed by later row' WHERE id=1; END IF;`} RETURN NEW; END $$;CREATE ${deferred ? "CONSTRAINT " : ""}TRIGGER final_value AFTER UPDATE ON "write fixture".${name} ${deferred ? "DEFERRABLE INITIALLY DEFERRED" : ""} FOR EACH ROW EXECUTE FUNCTION "write fixture".${name}_trigger();`,
        );
        const table = (await introspect(session)).tables.find(
          (t) => t.schema === "write fixture" && t.name === name,
        );
        if (!table) throw Error("Missing table");
        const rows = (await browser.fetch({ tableId: table.id })).rows;
        const first = rows[0]?.target,
          second = rows[1]?.target;
        if (!first || !second) throw Error("No targets");
        const result = await browser.save({
          changes: [
            { target: first, values: { value: "first draft" } },
            { target: second, values: { value: "second draft" } },
          ],
        });
        expect(result.kind).toBe("committed");
        if (result.kind !== "committed") throw Error("Not committed");
        const actual = await observer.client.query(
          `SELECT value FROM "write fixture".${name} ORDER BY id`,
        );
        expect(result.rows.map((r) => r.row.cells[1]?.text)).toEqual(
          actual.rows.map((r) => r.value),
        );
        expect(result.rows[0]?.row.cells[1]?.text).toBe(
          deferred ? "first draft!" : "changed by later row",
        );
        const refreshed = result.rows[0]?.row.target;
        if (!refreshed) throw Error("Missing refreshed target");
        const again = await browser.save({
          changes: [{ target: refreshed, values: { value: "next draft" } }],
        });
        expect(again.kind).toBe("committed");
        if (again.kind !== "committed") throw Error("Not committed");
        expect(again.rows[0]?.row.cells[1]?.text).toBe(
          (await observer.client.query(`SELECT value FROM "write fixture".${name} WHERE id=1`))
            .rows[0]?.value,
        );
      });
    test("deferred trigger changing returned key rolls back rather than issuing stale target", async () => {
      await observer.client.query(
        `CREATE TABLE "write fixture".key_trigger(id integer PRIMARY KEY,value text);INSERT INTO "write fixture".key_trigger VALUES(1,'original');CREATE FUNCTION "write fixture".key_trigger_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id<100 THEN UPDATE "write fixture".key_trigger SET id=NEW.id+100 WHERE id=NEW.id; END IF; RETURN NEW; END $$;CREATE CONSTRAINT TRIGGER key_change AFTER UPDATE ON "write fixture".key_trigger DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "write fixture".key_trigger_fn();`,
      );
      const table = (await introspect(session)).tables.find(
        (t) => t.schema === "write fixture" && t.name === "key_trigger",
      );
      if (!table) throw Error("Missing table");
      const target = (await browser.fetch({ tableId: table.id })).rows[0]?.target;
      if (!target) throw Error("No target");
      const result = await browser.save({
        changes: [{ target, values: { value: "must roll back" } }],
      });
      expect(result.kind).toBe("failed");
      if (result.kind !== "committed") expect(result.message).toContain("returned key");
      expect(
        (await observer.client.query('SELECT id::text,value FROM "write fixture".key_trigger'))
          .rows,
      ).toEqual([{ id: "1", value: "original" }]);
    });
    test("RLS denied UPDATE produces conflict while retaining row", async () => {
      await observer.client.query(
        `CREATE TABLE "write fixture".restricted(id integer PRIMARY KEY, value text);INSERT INTO "write fixture".restricted VALUES(1,'original');ALTER TABLE "write fixture".restricted ENABLE ROW LEVEL SECURITY;CREATE POLICY reads ON "write fixture".restricted FOR SELECT USING(true);CREATE ROLE dbapp_write_${version};GRANT USAGE ON SCHEMA "write fixture" TO dbapp_write_${version};GRANT SELECT,UPDATE ON "write fixture".restricted TO dbapp_write_${version};`,
      );
      try {
        await session.client.query(`SET ROLE dbapp_write_${version}`);
        const table = (await introspect(session)).tables.find(
          (t) => t.name === "restricted" && t.schema === "write fixture",
        );
        if (!table) throw Error("No restricted table");
        const target = (await browser.fetch({ tableId: table.id })).rows[0]?.target;
        if (!target) throw Error("No restricted target");
        expect(
          (await browser.save({ changes: [{ target, values: { value: "denied" } }] })).kind,
        ).toBe("conflict");
        expect(
          (await observer.client.query('SELECT value FROM "write fixture".restricted')).rows[0]
            ?.value,
        ).toBe("original");
      } finally {
        await session.client.query("RESET ROLE");
        await observer.client.query(
          `DROP OWNED BY dbapp_write_${version};DROP ROLE dbapp_write_${version}`,
        );
      }
    });
    test("concurrent saves serialize and reject the consumed version", async () => {
      const target = (await page()).rows[0]?.target;
      if (!target) throw Error("No target");
      const results = await Promise.all([
        browser.save({ changes: [{ target, values: { value: "serialized" } }] }),
        browser.save({ changes: [{ target, values: { value: "lost" } }] }),
      ]);
      expect(results.map((r) => r.kind)).toEqual(["committed", "failed"]);
    });
    for (const cut of ["before", "commit"])
      test(`connection loss ${cut} COMMIT never retries`, async () => {
        let armed = false;
        let awaitingCommit = false;
        const sockets = new Set<Socket>();
        const proxy = createServer((downstream) => {
          const upstream = connectSocket({ host: "127.0.0.1", port: 55400 + version });
          sockets.add(downstream);
          sockets.add(upstream);
          downstream.on("error", () => {});
          upstream.on("error", () => {});
          downstream.on("data", (data) => {
            const text = data.toString("utf8");
            if (armed && cut === "before" && text.includes("UPDATE ")) {
              upstream.destroy();
              downstream.destroy();
              return;
            }
            if (armed && cut === "commit" && text.includes("COMMIT")) awaitingCommit = true;
            upstream.write(data);
          });
          upstream.on("data", (data) => {
            if (awaitingCommit) {
              upstream.destroy();
              downstream.destroy();
              return;
            }
            downstream.write(data);
          });
          downstream.on("close", () => upstream.destroy());
          upstream.on("close", () => downstream.destroy());
        });
        await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
        const address = proxy.address();
        if (!address || typeof address === "string") throw Error("Missing proxy port");
        let interrupted: Session | undefined;
        try {
          interrupted = await connect(address.port);
          const isolated = new RowBrowser(interrupted);
          const target = (await isolated.fetch({ tableId })).rows[0]?.target;
          if (!target) throw Error("No target");
          const original = (
            await observer.client.query(
              'SELECT value FROM "write fixture"."quoted table" WHERE "part A"=2',
            )
          ).rows[0]?.value;
          armed = true;
          const result = await isolated.save({
            changes: [{ target, values: { value: "committed despite lost acknowledgement" } }],
          });
          expect(result.kind).toBe(cut === "commit" ? "unknown" : "failed");
          if (cut === "commit")
            expect(
              (await isolated.save({ changes: [{ target, values: { value: "must not retry" } }] }))
                .kind,
            ).toBe("unknown");
          const actual = (
            await observer.client.query(
              'SELECT value FROM "write fixture"."quoted table" WHERE "part A"=2',
            )
          ).rows[0]?.value;
          expect(actual).toBe(
            cut === "commit" ? "committed despite lost acknowledgement" : original,
          );
        } finally {
          await interrupted?.client.end().catch(() => {});
          for (const socket of sockets) socket.destroy();
          await new Promise<void>((resolve) => proxy.close(() => resolve()));
        }
      });
    test("deleted row conflicts and expired page target is explicit", async () => {
      const target = (await page()).rows[0]?.target;
      if (!target) throw Error("No target");
      await session.client.query('DELETE FROM "write fixture"."quoted table" WHERE "part A"=2');
      expect(
        (await browser.save({ changes: [{ target, values: { value: "missing" } }] })).kind,
      ).toBe("conflict");
      await page();
      const result = await browser.save({ changes: [{ target, values: { value: "expired" } }] });
      expect(result.kind).toBe("failed");
      if (result.kind !== "committed") expect(result.message).toContain("expired");
    });
  });
