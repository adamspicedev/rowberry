import { z } from "zod";
export const PAGE_BYTES = 16 * 1024 * 1024;
export const VALUE_BYTES = 32 * 1024 * 1024;
// One raw byte may require six bytes in the outer IPC JSON envelope.
export const VALUE_WIRE_BYTES = VALUE_BYTES * 6 + 1024 * 1024;
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
    table: TableSchema,
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

// Raw text and serialized transport budgets are distinct: JSON escaping may
// expand one source byte to six bytes in the IPC JSON envelope.
export const SAVE_BYTES = 32 * 1024 * 1024;
export const SAVE_WIRE_BYTES = SAVE_BYTES * 6 + 1024 * 1024;
export const SaveSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            target: z.uuid(),
            values: z.record(
              identifier,
              z
                .string()
                .max(SAVE_BYTES, "Save value exceeds the 32 MiB raw text limit.")
                .nullable(),
            ),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type SaveInput = z.infer<typeof SaveSchema>;
export const SaveResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("committed"),
      table: TableSchema,
      rows: z
        .array(
          z.object({ previousTarget: z.uuid(), row: RowPageSchema.shape.rows.element }).strict(),
        )
        .max(200),
    })
    .strict(),
  z
    .object({ kind: z.enum(["conflict", "failed", "unknown"]), message: z.string().max(1024) })
    .strict(),
]);
export type SaveResult = z.infer<typeof SaveResultSchema>;
