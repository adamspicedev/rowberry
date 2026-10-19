import { z } from "zod";
export const PAGE_BYTES = 16 * 1024 * 1024;
export const VALUE_BYTES = 32 * 1024 * 1024;
const identifier = z.string().min(1).max(63);
export const ColumnSchema = z
  .object({
    name: identifier,
    typeOid: z.number().int().positive(),
    typeName: z.string().max(256),
    nullable: z.boolean(),
    generated: z.boolean(),
    identity: z.boolean(),
    editable: z.boolean(),
  })
  .strict();
export const TableSchema = z
  .object({
    id: z.string().max(32),
    schema: identifier,
    name: identifier,
    kind: z.enum(["table", "view", "materialized view", "foreign table"]),
    columns: z.array(ColumnSchema).max(1600),
    key: z.array(identifier).max(32),
    keys: z
      .array(
        z
          .object({
            name: identifier,
            primary: z.boolean(),
            columns: z.array(identifier.nullable()).max(32),
            suitable: z.boolean(),
          })
          .strict(),
      )
      .max(256),
    editable: z.boolean(),
    rls: z.boolean(),
  })
  .strict();
export type Table = z.infer<typeof TableSchema>;
export const SchemaSnapshotSchema = z.object({ tables: z.array(TableSchema).max(10000) }).strict();
export type SchemaSnapshot = z.infer<typeof SchemaSnapshotSchema>;
export const FilterSchema = z
  .object({
    column: identifier,
    operator: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains", "isNull", "isNotNull"]),
    value: z.string().max(4096).nullable().default(null),
  })
  .strict();
export const SortSchema = z
  .object({ column: identifier, direction: z.enum(["asc", "desc"]) })
  .strict();
export const FetchSchema = z
  .object({
    tableId: z.string().min(1).max(32),
    filter: z.array(FilterSchema).max(16).default([]),
    sort: z.array(SortSchema).max(8).default([]),
    cursor: z.uuid().nullable().optional(),
    pageSize: z.number().int().min(1).max(1000).default(200),
  })
  .strict();
export type FetchInput = z.input<typeof FetchSchema>;
export const ValueInputSchema = z.object({ target: z.uuid(), column: identifier }).strict();
export const CellSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("value"),
      typeOid: z.number().int(),
      text: z.string().nullable(),
      editable: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("oversized"),
      typeOid: z.number().int(),
      text: z.null(),
      bytes: z.number().int().nonnegative(),
      editable: z.literal(false),
    })
    .strict(),
]);
export const RowPageSchema = z
  .object({
    rows: z
      .array(
        z.object({ cells: z.array(CellSchema).max(1600), target: z.uuid().nullable() }).strict(),
      )
      .max(1000),
    nextCursor: z.uuid().nullable(),
    stable: z.boolean(),
  })
  .strict();
export type RowPage = z.infer<typeof RowPageSchema>;
export const ValueSchema = z
  .object({ typeOid: z.number().int(), text: z.string(), editable: z.boolean() })
  .strict();
