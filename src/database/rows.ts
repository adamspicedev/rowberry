import { randomUUID } from "node:crypto";
import type { Session } from "./connections";
import { introspect, quote } from "./introspection";
import {
  FetchSchema,
  ValueInputSchema,
  PAGE_BYTES,
  VALUE_BYTES,
  type FetchInput,
  type RowPage,
  type Table,
} from "../shared/browse";
interface Identity {
  table: Table;
  values: (string | null)[];
  version: string | null;
}
interface Cursor {
  signature: string;
  values: (string | null)[];
  offset: number;
}
// Values and cursors are opaque handles; callers never supply row predicates.
// Only the latest page's identities remain live and at most 64 cursors survive.
export class RowBrowser {
  private targets = new Map<string, Identity>();
  private cursors = new Map<string, Cursor>();
  constructor(private readonly session: Session) {}
  async fetch(input: FetchInput): Promise<RowPage> {
    const args = FetchSchema.parse(input);
    const table = (await introspect(this.session)).tables.find((t) => t.id === args.tableId);
    if (!table) throw new Error("Table unavailable.");
    const source = quote(table.schema) + "." + quote(table.name);
    const column = (name: string) => {
      const c = table.columns.find((c) => c.name === name);
      if (!c) throw new Error("Column unavailable.");
      return c;
    };
    const parameters: (string | number | null)[] = [];
    const bind = (value: string | number | null) => {
      parameters.push(value);
      return "$" + parameters.length;
    };
    const where = args.filter.map((f) => {
      column(f.column);
      const name = quote(f.column);
      if (f.operator === "isNull") return `${name} IS NULL`;
      if (f.operator === "isNotNull") return `${name} IS NOT NULL`;
      if (f.operator === "contains")
        return `${name}::text LIKE ${bind("%" + (f.value ?? "").replace(/[\\%_]/g, "\\$&") + "%")}`;
      const operators = { eq: "=", ne: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" };
      if (f.value === null) throw new Error("Use a NULL filter.");
      return `${name} ${operators[f.operator]} ${bind(f.value)}`;
    });
    const order = [...args.sort];
    for (const sort of order) column(sort.column);
    if (new Set(order.map((s) => s.column)).size !== order.length)
      throw new Error("Duplicate sort.");
    for (const key of table.key)
      if (!order.some((s) => s.column === key)) order.push({ column: key, direction: "asc" });
    const stable = table.key.length > 0;
    const signature = JSON.stringify({ tableId: table.id, filter: args.filter, sort: args.sort });
    let offset = 0;
    if (args.cursor) {
      const cursor = this.cursors.get(args.cursor);
      if (!cursor || cursor.signature !== signature)
        throw new Error("Page expired. Reload the table.");
      offset = cursor.offset;
      if (stable) {
        // NULLS LAST in either direction. IS NOT DISTINCT FROM handles preceding
        // nullable sort columns without skipping peers in composite ordering.
        const branches = order.map((s, i) => {
          const preceding = order
            .slice(0, i)
            .map(
              (p, j) => `${quote(p.column)} IS NOT DISTINCT FROM ${bind(cursor.values[j] ?? null)}`,
            );
          const value = cursor.values[i] ?? null;
          const comparison =
            value === null
              ? "false"
              : `(${quote(s.column)} ${s.direction === "asc" ? ">" : "<"} ${bind(value)} OR ${quote(s.column)} IS NULL)`;
          return "(" + [...preceding, comparison].join(" AND ") + ")";
        });
        where.push("(" + branches.join(" OR ") + ")");
      }
    }
    // Each result cell is limited in SQL, before pg allocates a response. Budget
    // includes worst-case JSON escaping (6 bytes/character) and typed metadata.
    const cellLimit = Math.max(
      1,
      Math.min(8192, Math.floor(PAGE_BYTES / 8 / (args.pageSize * table.columns.length))),
    );
    const projections = table.columns.flatMap((c, i) => [
      `CASE WHEN octet_length(${quote(c.name)}::text)<=${cellLimit} THEN ${quote(c.name)}::text ELSE NULL END AS ${quote("v" + i)}`,
      `octet_length(${quote(c.name)}::text)::text AS ${quote("b" + i)}`,
    ]);
    const pageSize = Math.max(
      1,
      Math.min(
        args.pageSize,
        Math.floor(
          (PAGE_BYTES - 1024 * 1024) / (table.columns.length * (6 * cellLimit + 160) + 256),
        ),
      ),
    );
    const sortValue = (raw: Record<string, string | null>, name: string) =>
      raw["v" + table.columns.findIndex((c) => c.name === name)] ?? null;
    projections.push(
      table.kind === "table" ? 'xmin::text AS "version"' : 'NULL::text AS "version"',
    );
    const result = await this.session.client.query<Record<string, string | null>>(
      `SELECT ${projections.join(",")} FROM ${source} ${where.length ? "WHERE " + where.join(" AND ") : ""} ${order.length ? "ORDER BY " + order.map((s) => `${quote(s.column)} ${s.direction} NULLS LAST`).join(",") : ""} LIMIT ${pageSize} ${!stable ? "OFFSET " + offset : ""}`,
      parameters,
    );
    this.targets.clear();
    const rows: RowPage["rows"] = result.rows.map((raw) => {
      const cells: RowPage["rows"][number]["cells"] = table.columns.map((c, i) => {
        const bytes = raw["b" + i] === null ? null : Number(raw["b" + i]);
        return bytes !== null && bytes > cellLimit
          ? { kind: "oversized", typeOid: c.typeOid, text: null, bytes, editable: false }
          : { kind: "value", typeOid: c.typeOid, text: raw["v" + i] ?? null, editable: c.editable };
      });
      const keyValues = table.key.map((k) => sortValue(raw, k));
      const target =
        stable && table.kind === "table" && keyValues.every((v) => v !== null)
          ? randomUUID()
          : null;
      if (target)
        this.targets.set(target, { table, values: keyValues, version: raw.version ?? null });
      return { cells, target };
    });
    let nextCursor: string | null = null;
    const last = result.rows.at(-1);
    if (last && rows.length === pageSize) {
      const values = order.map((s) => sortValue(last, s.column));
      // A non-null oversized ordering value is deliberately not a usable cursor.
      const invalid = order.some(
        (s, i) =>
          values[i] === null &&
          last["b" + table.columns.findIndex((c) => c.name === s.column)] !== null,
      );
      if (invalid) throw new Error("Ordering value exceeds paging limits.");
      nextCursor = randomUUID();
      this.cursors.set(nextCursor, { signature, values, offset: offset + rows.length });
      if (this.cursors.size > 64) {
        const oldest = this.cursors.keys().next().value;
        if (oldest) this.cursors.delete(oldest);
      }
    }
    const page = { rows, nextCursor, stable };
    if (Buffer.byteLength(JSON.stringify(page)) > PAGE_BYTES)
      throw new Error("Page exceeds supported limits.");
    return page;
  }
  async value(input: { target: string; column: string }) {
    const args = ValueInputSchema.parse(input);
    const identity = this.targets.get(args.target);
    if (!identity) throw new Error("Row expired. Reload the table.");
    const current = (await introspect(this.session)).tables.find(
      (t) =>
        t.id === identity.table.id &&
        t.schema === identity.table.schema &&
        t.name === identity.table.name,
    );
    const c = current?.columns.find((c) => c.name === args.column);
    if (!c || ![114, 3802].includes(c.typeOid))
      throw new Error("Only JSON inspection is supported.");
    const params: (string | null)[] = [...identity.values];
    const where = identity.table.key.map((key, i) => `${quote(key)} = $${i + 1}`);
    if (identity.version) {
      params.push(identity.version);
      where.push(`xmin::text = $${params.length}`);
    }
    const name = quote(c.name);
    const result = await this.session.client.query<{ text: string | null; bytes: string | null }>(
      `SELECT CASE WHEN octet_length(${name}::text)<=${VALUE_BYTES} THEN ${name}::text ELSE NULL END AS text,octet_length(${name}::text)::text AS bytes FROM ${quote(identity.table.schema)}.${quote(identity.table.name)} WHERE ${where.join(" AND ")} LIMIT 2`,
      params,
    );
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row || row.text === null || Number(row.bytes) > VALUE_BYTES)
      throw new Error("Value unavailable, changed, or exceeds the 32 MiB limit.");
    return { typeOid: c.typeOid, text: row.text, editable: c.editable };
  }
}
