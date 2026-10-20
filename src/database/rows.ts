import { parseDocument } from "../json/document";
import { randomUUID } from "node:crypto";
import type { Session } from "./connections";
import { introspect, quote } from "./introspection";
import {
  FetchSchema,
  SaveSchema,
  SAVE_BYTES,
  type SaveInput,
  type SaveResult,
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
export class BrowseColumnLimitError extends Error {}
// Values and cursors are opaque handles; callers never supply row predicates.
// Only the latest page's identities remain live and at most 64 cursors survive.
export class RowBrowser {
  private queue: Promise<void> = Promise.resolve();
  private refreshRequired = false;
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private targets = new Map<string, Identity>();
  private cursors = new Map<string, Cursor>();
  constructor(private readonly session: Session) {}
  fetch(input: FetchInput): Promise<RowPage> {
    return this.serialize(async () => {
      const page = await this.fetchPage(input);
      this.refreshRequired = false;
      return page;
    });
  }
  private async fetchPage(input: FetchInput): Promise<RowPage> {
    const args = FetchSchema.parse(input);
    const table = (await introspect(this.session)).tables.find((t) => t.id === args.tableId);
    if (!table) throw new Error("Table unavailable.");
    if (table.columns.length > 800)
      throw new BrowseColumnLimitError(
        "Browsing supports at most 800 visible columns. Select a narrower view or use SQL.",
      );
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
    const page = { table, rows, nextCursor, stable };
    if (Buffer.byteLength(JSON.stringify(page)) > PAGE_BYTES)
      throw new Error("Page exceeds supported limits.");
    return page;
  }
  save(input: SaveInput): Promise<SaveResult> {
    return this.serialize(() => this.saveBatch(input));
  }
  private async saveBatch(input: SaveInput): Promise<SaveResult> {
    if (this.refreshRequired)
      return {
        kind: "unknown",
        message:
          "The previous commit outcome is unknown. Refresh or reconnect before saving again.",
      };
    let began = false;
    let committing = false;
    try {
      const args = SaveSchema.parse(input);
      if (this.session.transaction !== "idle")
        throw new Error("Finish the SQL transaction before saving table edits.");
      if (new Set(args.changes.map((c) => c.target)).size !== args.changes.length)
        throw new Error("Duplicate row target in save batch.");
      let bytes = 0;
      const identities = args.changes.map((change) => {
        const identity = this.targets.get(change.target);
        if (!identity)
          throw new Error("Row target expired. Reload the table; retain or copy your draft first.");
        for (const value of Object.values(change.values))
          bytes += value === null ? 0 : Buffer.byteLength(value);
        if (!Object.keys(change.values).length || Object.keys(change.values).length > 800)
          throw new Error("Save requires between 1 and 800 changed columns per row.");
        return identity;
      });
      if (bytes > SAVE_BYTES)
        throw new Error(
          "Save batch exceeds the 32 MiB raw UTF-8 text limit. Reduce the draft or batch size.",
        );
      const first = identities[0];
      if (!first || identities.some((i) => i.table.id !== first.table.id))
        throw new Error("Save one table at a time.");
      await this.session.client.query("BEGIN");
      began = true;
      // Prevent catalog changes between permission/type validation and UPDATE.
      await this.session.client.query(
        `LOCK TABLE ${quote(first.table.schema)}.${quote(first.table.name)} IN ROW EXCLUSIVE MODE`,
      );
      const table = (await introspect(this.session)).tables.find(
        (t) =>
          t.id === first.table.id && t.schema === first.table.schema && t.name === first.table.name,
      );
      if (
        !table ||
        !table.editable ||
        table.kind !== "table" ||
        JSON.stringify(table.key) !== JSON.stringify(first.table.key)
      )
        throw new Error("Table identity or editability changed. Reload the table before saving.");
      const cellLimit = Math.max(
        1,
        Math.min(
          8192,
          Math.floor((PAGE_BYTES - 1024 * 1024) / 8 / args.changes.length / table.columns.length),
        ),
      );
      const projections = table.columns.flatMap((c, i) => [
        `CASE WHEN octet_length(${quote(c.name)}::text)<=${cellLimit} THEN ${quote(c.name)}::text ELSE NULL END AS ${quote("v" + i)}`,
        `octet_length(${quote(c.name)}::text)::text AS ${quote("b" + i)}`,
      ]);
      projections.push(
        'xmin::text AS "version"',
        ...table.key.map(
          (key, i) =>
            `CASE WHEN octet_length(${quote(key)}::text)<=8192 THEN ${quote(key)}::text ELSE NULL END AS ${quote("k" + i)}`,
        ),
      );
      const pending: { previousTarget: string; keys: (string | null)[] }[] = [];
      const updated: {
        previousTarget: string;
        row: RowPage["rows"][number];
        identity: Identity;
      }[] = [];
      for (const [index, change] of args.changes.entries()) {
        const original = identities[index];
        if (!original?.version) throw new Error("Row version unavailable. Reload the table.");
        const parameters: (string | null)[] = [];
        const bind = (value: string | null) => {
          parameters.push(value);
          return "$" + parameters.length;
        };
        const assignments = Object.entries(change.values).map(([name, value]) => {
          const column = table.columns.find((c) => c.name === name);
          const oldColumn = original.table.columns.find((c) => c.name === name);
          if (
            !column?.editable ||
            !oldColumn ||
            column.typeOid !== oldColumn.typeOid ||
            column.typeName !== oldColumn.typeName
          )
            throw new Error(
              "Column unavailable, generated, or changed type. Reload before saving.",
            );
          if (
            value !== null &&
            [114, 3802].includes(column.typeOid) &&
            !parseDocument(value).editable
          )
            throw new Error("JSON must be valid, duplicate-free, and within the 32 MiB limit.");
          return `${quote(name)} = ${bind(value)}`;
        });
        const where = table.key.map(
          (key, i) => `${quote(key)} = ${bind(original.values[i] ?? null)}`,
        );
        where.push(`xmin::text = ${bind(original.version)}`);
        const result = await this.session.client.query<Record<string, string | null>>(
          `UPDATE ${quote(table.schema)}.${quote(table.name)} SET ${assignments.join(",")} WHERE ${where.join(" AND ")} RETURNING ${projections.join(",")}`,
          parameters,
        );
        if (result.rowCount !== 1 || result.rows.length !== 1) {
          await this.session.client.query("ROLLBACK");
          began = false;
          return {
            kind: "conflict",
            message:
              "A row changed, was deleted, or is no longer writable. No edits were saved. Reload and compare your retained draft.",
          };
        }
        const returned = result.rows[0];
        if (!returned) throw new Error("Saved row unavailable.");
        if (table.key.some((_, i) => returned["k" + i] == null))
          throw new Error(
            "Updated row key exceeds the 8192 byte identity limit. No edits were saved.",
          );
        pending.push({
          previousTarget: change.target,
          keys: table.key.map((_, i) => returned["k" + i] ?? null),
        });
      }
      // Finish all writes and fire deferred constraint triggers before establishing
      // the baseline represented by returned cells and opaque row-version targets.
      await this.session.client.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const saved of pending) {
        const final = await this.session.client.query<Record<string, string | null>>(
          `SELECT ${projections.join(",")} FROM ${quote(table.schema)}.${quote(table.name)} WHERE ${table.key.map((key, i) => `${quote(key)} = $${i + 1}`).join(" AND ")} LIMIT 2`,
          saved.keys,
        );
        const raw = final.rows[0];
        if (final.rows.length !== 1 || !raw)
          throw new Error(
            "Updated row is no longer visible at its returned key. No edits were saved.",
          );
        if (table.key.some((_, i) => raw["k" + i] == null))
          throw new Error(
            "Updated row key exceeds the 8192 byte identity limit. No edits were saved.",
          );
        const target = randomUUID();
        const cells: RowPage["rows"][number]["cells"] = table.columns.map((c, i) =>
          raw["b" + i] !== null && Number(raw["b" + i]) > cellLimit
            ? {
                kind: "oversized",
                typeOid: c.typeOid,
                text: null,
                bytes: Number(raw["b" + i]),
                editable: false,
              }
            : {
                kind: "value",
                typeOid: c.typeOid,
                text: raw["v" + i] ?? null,
                editable: c.editable,
              },
        );
        updated.push({
          previousTarget: saved.previousTarget,
          row: { target, cells },
          identity: {
            table,
            values: table.key.map((_, i) => raw["k" + i] ?? null),
            version: raw.version ?? null,
          },
        });
      }
      const result: SaveResult = {
        kind: "committed",
        table,
        rows: updated.map(({ previousTarget, row }) => ({ previousTarget, row })),
      };
      if (Buffer.byteLength(JSON.stringify(result)) > PAGE_BYTES)
        throw new Error("Refreshed rows exceed the 16 MiB response limit. Save a smaller batch.");
      committing = true;
      await this.session.client.query("COMMIT");
      began = false;
      for (const update of updated) {
        this.targets.delete(update.previousTarget);
        if (update.row.target) this.targets.set(update.row.target, update.identity);
      }
      return result;
    } catch (error) {
      if (committing) {
        this.refreshRequired = true;
        this.targets.clear();
        return {
          kind: "unknown",
          message:
            "Connection or server error during COMMIT. The outcome is unknown. Keep your draft and refresh or reconnect before another save; do not retry automatically.",
        };
      }
      if (began) await this.session.client.query("ROLLBACK").catch(() => {});
      // Database errors may contain draft data or server details. Local validation
      // messages are safe; PostgreSQL exceptions deliberately use a fixed message.
      const message =
        error instanceof Error && !("code" in error)
          ? error.message
          : "Save failed. No edits were committed. Check column values and database permissions; your draft is retained.";
      return { kind: "failed", message: message.slice(0, 1024) };
    }
  }
  value(input: { target: string; column: string }) {
    return this.serialize(() => this.fetchValue(input));
  }
  private async fetchValue(input: { target: string; column: string }) {
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
    if (
      result.rows.length !== 1 ||
      !row ||
      row.text === null ||
      Number(row.bytes) > VALUE_BYTES ||
      Buffer.byteLength(row.text, "utf8") > VALUE_BYTES
    )
      throw new Error("Value unavailable, changed, or exceeds the 32 MiB limit.");
    return { typeOid: c.typeOid, text: row.text, editable: c.editable };
  }
}
