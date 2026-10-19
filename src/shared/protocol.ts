import { z } from "zod";
import {
  FetchSchema,
  ValueInputSchema,
  SchemaSnapshotSchema,
  RowPageSchema,
  ValueSchema,
  PAGE_BYTES,
  VALUE_BYTES,
} from "./browse";
export const REQUEST_CHANNEL = "dbapp:request";
export const EVENT_CHANNEL = "dbapp:event";
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const RequestIdSchema = z.string().min(1).max(128).brand<"RequestId">();
export const SessionIdSchema = z.uuid().brand<"SessionId">();
export type SessionId = z.infer<typeof SessionIdSchema>;
export const ConnectionIdSchema = z.uuid().brand<"ConnectionId">();
const certificatePath = z.string().min(1).max(512);
export const TlsSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("verify-full"),
      caPath: certificatePath.optional(),
      client: z.object({ certPath: certificatePath, keyPath: certificatePath }).strict().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("require"), acknowledged: z.literal(true) }).strict(),
  z.object({ kind: z.literal("disable"), acknowledged: z.literal(true) }).strict(),
]);
export const ConnectionProfileSchema = z
  .object({
    id: ConnectionIdSchema,
    name: z.string().trim().min(1).max(80),
    host: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(/^[a-zA-Z0-9.:[\]_-]+$/),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1).max(128),
    user: z.string().min(1).max(128),
    tls: TlsSchema,
    environmentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
export type ConnectionProfile = z.infer<typeof ConnectionProfileSchema>;
export type ConnectionId = ConnectionProfile["id"];
export const BrowseCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("schema.list"),
      requestId: RequestIdSchema,
      sessionId: SessionIdSchema,
      generation: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rows.fetch"),
      requestId: RequestIdSchema,
      sessionId: SessionIdSchema,
      generation: z.number().int().positive(),
      ...FetchSchema.shape,
    })
    .strict(),
  z
    .object({
      kind: z.literal("rows.value"),
      requestId: RequestIdSchema,
      sessionId: SessionIdSchema,
      generation: z.number().int().positive(),
      ...ValueInputSchema.shape,
    })
    .strict(),
]);
export type BrowseCommand = z.infer<typeof BrowseCommandSchema>;
export const TabIdSchema = z.uuid().brand<"TabId">();
export const QueryIdSchema = z.uuid().brand<"QueryId">();
export const SqlSchema = z
  .string()
  .min(1)
  .max(1024 * 1024)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 1024 * 1024,
    "SQL exceeds the 1 MiB limit.",
  );
const queryOwner = {
  requestId: RequestIdSchema,
  sessionId: SessionIdSchema,
  generation: z.number().int().positive(),
  tabId: TabIdSchema,
};
export const QueryCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("queries.openTab"), ...queryOwner }).strict(),
  z.object({ kind: z.literal("queries.closeTab"), ...queryOwner }).strict(),
  z.object({ kind: z.literal("queries.start"), ...queryOwner, sql: SqlSchema }).strict(),
  z
    .object({
      kind: z.literal("queries.fetch"),
      ...queryOwner,
      queryId: QueryIdSchema,
      pageSize: z.number().int().min(1).max(1000).default(200),
    })
    .strict(),
  z.object({ kind: z.literal("queries.cancel"), ...queryOwner, queryId: QueryIdSchema }).strict(),
  z.object({ kind: z.literal("queries.close"), ...queryOwner, queryId: QueryIdSchema }).strict(),
]);
export type QueryCommand = z.infer<typeof QueryCommandSchema>;
export const QueryPageSchema = z
  .object({
    queryId: QueryIdSchema,
    fields: z.array(z.object({ name: z.string(), typeOid: z.number().int() }).strict()),
    rows: z.array(z.array(z.string().nullable())).max(1000),
    done: z.boolean(),
    status: z.enum(["running", "complete", "error", "cancelled", "limit", "unknown"]),
    transaction: z.enum(["idle", "active", "aborted", "unknown"]),
    durationMs: z.number(),
    command: z.string().nullable(),
    rowCount: z.number().nullable(),
    error: z.string().max(4096).nullable(),
  })
  .strict();
export type SqlPage = z.infer<typeof QueryPageSchema>;
export const CommandSchema = z.discriminatedUnion("kind", [
  ...BrowseCommandSchema.options,
  ...QueryCommandSchema.options,
  z
    .object({
      kind: z.literal("queries.saved.list"),
      requestId: RequestIdSchema,
      offset: z.number().int().min(0).max(100000).default(0),
    })
    .strict(),
  z
    .object({ kind: z.literal("queries.saved.get"), requestId: RequestIdSchema, id: z.uuid() })
    .strict(),
  z
    .object({
      kind: z.literal("queries.saved.save"),
      requestId: RequestIdSchema,
      id: z.uuid(),
      name: z.string().trim().min(1).max(80),
      sql: SqlSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("sessions.open"),
      requestId: RequestIdSchema,
      profileId: ConnectionIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("sessions.close"),
      requestId: RequestIdSchema,
      sessionId: SessionIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal("app.info"), requestId: RequestIdSchema }).strict(),
  z
    .object({
      kind: z.literal("connections.list"),
      requestId: RequestIdSchema,
      offset: z.number().int().min(0).max(100000).default(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("connections.save"),
      requestId: RequestIdSchema,
      profile: ConnectionProfileSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("connections.delete"),
      requestId: RequestIdSchema,
      id: ConnectionIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("connections.connect"),
      requestId: RequestIdSchema,
      id: ConnectionIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("connections.submitSecret"),
      requestId: RequestIdSchema,
      id: ConnectionIdSchema,
      secret: z.string().max(4096),
      persist: z.boolean(),
    })
    .strict(),
]);
export type Command = z.infer<typeof CommandSchema>;
export const ErrorSchema = z
  .object({
    code: z.enum([
      "VALIDATION_ERROR",
      "UNTRUSTED_SENDER",
      "INTERNAL_ERROR",
      "UNAVAILABLE",
      "CONNECTION_FAILED",
      "BROWSE_COLUMN_LIMIT",
      "QUERY_TAB_LIMIT",
      "QUERY_UNAVAILABLE",
    ]),
    message: z.string().max(256),
    retryable: z.boolean(),
    outcome: z.enum(["failed", "unknown"]),
  })
  .strict();
const successFields = { ok: z.literal(true), requestId: RequestIdSchema };
const sessionData = z
  .object({
    sessionId: SessionIdSchema,
    generation: z.number().int().positive(),
    serverVersion: z.string().max(128),
  })
  .strict();
const SuccessSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...successFields,
      kind: z.literal("queries.saved.list"),
      data: z
        .object({
          items: z.array(z.object({ id: z.uuid(), name: z.string().max(80) }).strict()).max(20),
          nextOffset: z.number().int().nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("queries.saved.get"),
      data: z.object({ id: z.uuid(), name: z.string().max(80), sql: SqlSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("queries.saved.save"),
      data: z.object({}).strict(),
    })
    .strict(),

  z
    .object({ ...successFields, kind: z.literal("queries.openTab"), data: z.object({}).strict() })
    .strict(),
  z
    .object({ ...successFields, kind: z.literal("queries.closeTab"), data: z.object({}).strict() })
    .strict(),
  z
    .object({ ...successFields, kind: z.literal("queries.cancel"), data: z.object({}).strict() })
    .strict(),
  z
    .object({ ...successFields, kind: z.literal("queries.close"), data: z.object({}).strict() })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("queries.start"),
      data: z.object({ queryId: QueryIdSchema }).strict(),
    })
    .strict(),
  z.object({ ...successFields, kind: z.literal("queries.fetch"), data: QueryPageSchema }).strict(),

  z
    .object({ ...successFields, kind: z.literal("schema.list"), data: SchemaSnapshotSchema })
    .strict(),
  z.object({ ...successFields, kind: z.literal("rows.fetch"), data: RowPageSchema }).strict(),
  z.object({ ...successFields, kind: z.literal("rows.value"), data: ValueSchema }).strict(),
  z.object({ ...successFields, kind: z.literal("sessions.open"), data: sessionData }).strict(),
  z
    .object({ ...successFields, kind: z.literal("connections.connect"), data: sessionData })
    .strict(),
  z
    .object({ ...successFields, kind: z.literal("sessions.close"), data: z.object({}).strict() })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("app.info"),
      data: z
        .object({
          name: z.string().max(128),
          version: z.string().max(64),
          platform: z.string().max(32),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("connections.list"),
      data: z
        .object({
          profiles: z.array(ConnectionProfileSchema).max(20),
          nextOffset: z.number().int().nullable(),
          secureStorage: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("connections.save"),
      data: ConnectionProfileSchema,
    })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("connections.delete"),
      data: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...successFields,
      kind: z.literal("connections.submitSecret"),
      data: z.object({ storage: z.enum(["secure", "session"]) }).strict(),
    })
    .strict(),
]);
export const ReplySchema = z.union([
  SuccessSchema,
  z
    .object({ ok: z.literal(false), requestId: RequestIdSchema.nullable(), error: ErrorSchema })
    .strict(),
]);
export type Reply = z.infer<typeof ReplySchema>;
export const QueryEventSchema = z
  .object({
    kind: z.literal("queries.state"),
    sessionId: SessionIdSchema,
    generation: z.number().int().positive(),
    tabId: TabIdSchema,
    queryId: QueryIdSchema,
    status: QueryPageSchema.shape.status,
    transaction: QueryPageSchema.shape.transaction,
    error: z.string().max(4096).nullable(),
  })
  .strict();
export const AppEventSchema = z.discriminatedUnion("kind", [
  QueryEventSchema,
  z.object({ kind: z.literal("app.lifecycle"), state: z.literal("ready") }).strict(),
  z
    .object({
      kind: z.literal("sessions.state"),
      sessionId: SessionIdSchema,
      profileId: ConnectionIdSchema,
      generation: z.number().int().positive(),
      state: z.enum(["connecting", "connected", "disconnected"]),
    })
    .strict(),
]);
export type AppEvent = z.infer<typeof AppEventSchema>;
export type EventListener = (event: AppEvent) => void;
export interface DesktopBridge {
  request(command: Command): Promise<Reply>;
  subscribe(listener: EventListener): () => void;
  unsubscribe(listener: EventListener): void;
}
export function boundedReply(value: unknown, kind: Command["kind"]): boolean {
  return bounded(
    value,
    kind === "queries.saved.get"
      ? 1024 * 1024 + 2048
      : kind === "rows.value"
        ? VALUE_BYTES
        : kind === "rows.fetch" || kind === "schema.list" || kind === "queries.fetch"
          ? PAGE_BYTES
          : MAX_MESSAGE_BYTES,
  );
}
export function boundedCommand(value: unknown): boolean {
  return bounded(value, 1024 * 1024 + 2048);
}
export function bounded(value: unknown, limit = MAX_MESSAGE_BYTES): boolean {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" && new TextEncoder().encode(text).length <= limit;
  } catch {
    return false;
  }
}
export function failure(
  code: z.infer<typeof ErrorSchema>["code"],
  requestId: z.infer<typeof RequestIdSchema> | null = null,
): Reply {
  const messages = {
    QUERY_TAB_LIMIT: "At most 16 SQL tabs can be open. Close a tab before opening another.",
    QUERY_UNAVAILABLE:
      "SQL session unavailable or busy. Wait for active work, end the result explicitly, or reopen the tab session. SQL was not retried.",
    BROWSE_COLUMN_LIMIT:
      "Browsing supports at most 800 visible columns. Select a narrower view or use SQL.",
    VALIDATION_ERROR: "Invalid application command.",
    UNTRUSTED_SENDER: "This frame cannot access the application.",
    INTERNAL_ERROR: "The operation could not be completed.",
    UNAVAILABLE: "This operation is unavailable.",
    CONNECTION_FAILED:
      "Database connection failed. Check credentials, TLS settings and server availability.",
  };
  return {
    ok: false,
    requestId,
    error: { code, message: messages[code], retryable: false, outcome: "failed" },
  };
}
