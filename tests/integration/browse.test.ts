import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openSession } from "../../src/database/connections";
import { introspect } from "../../src/database/introspection";
import { RowBrowser } from "../../src/database/rows";
import { ConnectionProfileSchema, SessionIdSchema } from "../../src/shared/protocol";
import type { Session } from "../../src/database/connections";
for (const version of [14, 18])
  describe(`browse PostgreSQL ${version}`, () => {
    let session: Session;
    let browser: RowBrowser;
    const role = `dbapp_browse_${version}`;
    beforeAll(async () => {
      session = await openSession({
        sessionId: SessionIdSchema.parse(crypto.randomUUID()),
        generation: 1,
        password: "fixture-only-password",
        profile: ConnectionProfileSchema.parse({
          id: crypto.randomUUID(),
          name: "Browse fixture",
          host: "localhost",
          port: 55400 + version,
          user: "fixture",
          database: "fixture",
          tls: { kind: "disable", acknowledged: true },
          environmentColor: "#123456",
        }),
      });
      await session.client
        .query(`DROP SCHEMA IF EXISTS "browse fixture" CASCADE; CREATE SCHEMA "browse fixture";
      CREATE TABLE "browse fixture"."quoted table" ("part A" integer, "part B" text, n numeric, doc json, calculated integer GENERATED ALWAYS AS ("part A" + 1) STORED, PRIMARY KEY ("part A", "part B"));
      INSERT INTO "browse fixture"."quoted table" SELECT i, 'key"' || i, 12345678901234567890.123456789, CASE WHEN i = 1 THEN NULL ELSE '{"n":9007199254740993,"n":2}'::json END FROM generate_series(1,450) i;
      CREATE TABLE "browse fixture".empty (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
      CREATE TABLE "browse fixture".sort_nulls(id integer PRIMARY KEY, rank integer); INSERT INTO "browse fixture".sort_nulls VALUES (1,1),(2,1),(3,2),(4,NULL),(5,NULL);
      CREATE TABLE "browse fixture".keyless (v text); INSERT INTO "browse fixture".keyless VALUES ('a'),('b');
      CREATE VIEW "browse fixture".viewed AS SELECT * FROM "browse fixture".empty;
      CREATE TABLE "browse fixture".unique_key (id integer NOT NULL UNIQUE, v text);
      CREATE TABLE "browse fixture".custom_key (id text NOT NULL); CREATE UNIQUE INDEX custom_key_index ON "browse fixture".custom_key (id text_pattern_ops);
      CREATE TABLE "browse fixture".expression_key (id text NOT NULL); CREATE UNIQUE INDEX expression_key_index ON "browse fixture".expression_key (upper(id));
      CREATE TABLE "browse fixture".inherited_parent (id integer PRIMARY KEY); CREATE TABLE "browse fixture".inherited_child () INHERITS ("browse fixture".inherited_parent);
      CREATE TABLE "browse fixture".partial_key (id integer NOT NULL); CREATE UNIQUE INDEX partial_key_index ON "browse fixture".partial_key (id) WHERE id>0;
      CREATE TABLE "browse fixture".nullable_key (id integer UNIQUE, v text);
      CREATE TABLE "browse fixture".large (id integer PRIMARY KEY, doc json);
      INSERT INTO "browse fixture".large VALUES (1, ('"' || repeat('x',1048576) || '"')::json), (2, ('"' || repeat('x',33554432) || '"')::json);
      CREATE TABLE "browse fixture".restricted (id integer PRIMARY KEY);
      INSERT INTO "browse fixture".restricted VALUES (1),(2); ALTER TABLE "browse fixture".restricted ENABLE ROW LEVEL SECURITY; ALTER TABLE "browse fixture".restricted FORCE ROW LEVEL SECURITY;
      CREATE POLICY visible ON "browse fixture".restricted USING (id=1);
      CREATE ROLE dbapp_browse_${version}; GRANT USAGE ON SCHEMA "browse fixture" TO dbapp_browse_${version}; GRANT SELECT ON ALL TABLES IN SCHEMA "browse fixture" TO dbapp_browse_${version};`);
      browser = new RowBrowser(session);
    }, 30000);
    afterAll(async () => {
      if (session) {
        await session.client.query("RESET ROLE");
        await session.client.query('DROP SCHEMA IF EXISTS "browse fixture" CASCADE');
        await session.client.query(`DROP ROLE IF EXISTS ${role}`);
        await session.client.end();
      }
    });
    async function table(name: string) {
      const snapshot = await introspect(session);
      const found = snapshot.tables.find((t) => t.schema === "browse fixture" && t.name === name);
      if (!found) throw new Error(`Missing ${name}`);
      return found;
    }
    test("catalog handles quoted names, composite keys, generated columns, views and suitable unique keys", async () => {
      const t = await table("quoted table");
      expect(t.key).toEqual(["part A", "part B"]);
      expect(t.editable).toBe(true);
      expect(t.columns.find((c) => c.name === "calculated")).toMatchObject({
        generated: true,
        editable: false,
        typeOid: 23,
      });
      expect(await table("viewed")).toMatchObject({ kind: "view", editable: false });
      expect(await table("keyless")).toMatchObject({ key: [], editable: false });
      expect(await table("unique_key")).toMatchObject({ key: ["id"], editable: true });
      expect(await table("nullable_key")).toMatchObject({ key: [], editable: false });
      expect(await table("custom_key")).toMatchObject({ key: [], editable: false });
      expect(await table("partial_key")).toMatchObject({ key: [], editable: false });
      expect(await table("inherited_parent")).toMatchObject({ key: [], editable: false });
      expect(await table("expression_key")).toMatchObject({
        key: [],
        editable: false,
        keys: [{ columns: [null], suitable: false }],
      });
    });
    test("pages preserve raw values, NULL and composite identity without repeats", async () => {
      const t = await table("quoted table");
      const first = await browser.fetch({ tableId: t.id });
      expect(first.rows).toHaveLength(200);
      expect(first.rows[0]?.cells[2]?.text).toBe("12345678901234567890.123456789");
      expect(first.rows[0]?.cells[3]?.text).toBeNull();
      expect(first.rows[1]?.cells[3]?.text).toBe('{"n":9007199254740993,"n":2}');
      const second = await browser.fetch({
        tableId: t.id,
        pageSize: 200,
        cursor: first.nextCursor,
      });
      expect(second.rows[0]?.cells[0]?.text).toBe("201");
      expect(new Set([...first.rows, ...second.rows].map((r) => r.cells[0]?.text)).size).toBe(400);
    });
    test("bound filter values, sorted keyset cursors and empty results", async () => {
      const t = await table("quoted table");
      const page = await browser.fetch({
        tableId: t.id,
        pageSize: 2,
        sort: [{ column: "part A", direction: "desc" }],
        filter: [{ column: "part B", operator: "eq", value: 'key"450' }],
      });
      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.cells[0]?.text).toBe("450");
      expect(
        (
          await browser.fetch({
            tableId: t.id,
            filter: [{ column: "part B", operator: "eq", value: "' OR true --" }],
          })
        ).rows,
      ).toHaveLength(0);
      expect((await browser.fetch({ tableId: (await table("empty")).id })).rows).toHaveLength(0);
      await expect(browser.fetch({ tableId: t.id, pageSize: 1001 })).rejects.toThrow();
      expect((await browser.fetch({ tableId: t.id, pageSize: 1000 })).rows).toHaveLength(450);
    });
    test("keyless and view rows remain read-only with explicit unstable paging", async () => {
      const page = await browser.fetch({ tableId: (await table("keyless")).id, pageSize: 1 });
      expect(page.stable).toBe(false);
      expect(page.rows[0]?.target).toBeNull();
    });
    test("identity flags and RLS obey the actual connected role", async () => {
      expect((await table("empty")).columns[0]).toMatchObject({ identity: true, editable: false });
      await session.client.query(`SET ROLE ${role}`);
      try {
        const t = await table("restricted");
        expect(t.rls).toBe(true);
        expect(t.editable).toBe(false);
        const page = await browser.fetch({ tableId: t.id });
        expect(page.rows.map((r) => r.cells[0]?.text)).toEqual(["1"]);
      } finally {
        await session.client.query("RESET ROLE");
      }
    });
    test("nullable sort peers use key tie breakers in both directions", async () => {
      const t = await table("sort_nulls");
      for (const direction of ["asc", "desc"] satisfies ("asc" | "desc")[]) {
        const seen: string[] = [];
        let cursor: string | null | undefined;
        do {
          const page = await browser.fetch({
            tableId: t.id,
            pageSize: 2,
            sort: [{ column: "rank", direction }],
            cursor,
          });
          seen.push(...page.rows.map((r) => r.cells[0]?.text ?? ""));
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toEqual(
          direction === "asc" ? ["1", "2", "3", "4", "5"] : ["3", "1", "2", "4", "5"],
        );
      }
    });
    test("pages carry the authoritative column layout after an external earlier-column drop", async () => {
      await session.client.query(
        `CREATE TABLE "browse fixture".schema_change(id integer PRIMARY KEY,removed text,doc json); INSERT INTO "browse fixture".schema_change VALUES(1,'old','{"n":9007199254740993}'::json)`,
      );
      const t = await table("schema_change");
      const before = await browser.fetch({ tableId: t.id });
      expect(before.table.columns.map((c) => c.name)).toEqual(["id", "removed", "doc"]);
      await session.client.query('ALTER TABLE "browse fixture".schema_change DROP COLUMN removed');
      const after = await browser.fetch({ tableId: t.id });
      expect(after.table.columns.map((c) => c.name)).toEqual(["id", "doc"]);
      expect(after.rows[0]?.cells[1]).toMatchObject({
        typeOid: 114,
        text: '{"n":9007199254740993}',
      });
    });
    test("wide tables fail explicitly before exceeding PostgreSQL target-list limits", async () => {
      await session.client.query(
        `CREATE TABLE "browse fixture".too_wide (id integer PRIMARY KEY,${Array.from({ length: 800 }, (_, i) => `c${i} text`).join(",")})`,
      );
      const t = await table("too_wide");
      await expect(browser.fetch({ tableId: t.id })).rejects.toThrow("at most 800 visible columns");
    });
    test("oversized JSON is explicit, bounded and separately retrievable with a hard full-value cap", async () => {
      const t = await table("large");
      const page = await browser.fetch({ tableId: t.id });
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(16 * 1024 * 1024);
      const cell = page.rows[0]?.cells[1];
      expect(cell).toMatchObject({ kind: "oversized", text: null, editable: false });
      const row = page.rows[0];
      if (!row?.target) throw new Error("Missing target");
      expect((await browser.value({ target: row.target, column: "doc" })).text.length).toBe(
        1048578,
      );
      const large = page.rows[1];
      if (!large?.target) throw new Error("Missing target");
      await expect(browser.value({ target: large.target, column: "doc" })).rejects.toThrow();
    });
  });
