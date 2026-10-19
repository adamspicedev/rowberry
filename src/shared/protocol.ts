import { z } from "zod";
export const REQUEST_CHANNEL = "dbapp:request";
export const EVENT_CHANNEL = "dbapp:event";
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const RequestIdSchema = z.string().min(1).max(128).brand<"RequestId">();
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
export const CommandSchema = z.discriminatedUnion("kind", [
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
    code: z.enum(["VALIDATION_ERROR", "UNTRUSTED_SENDER", "INTERNAL_ERROR", "UNAVAILABLE"]),
    message: z.string().max(256),
    retryable: z.boolean(),
    outcome: z.enum(["failed", "unknown"]),
  })
  .strict();
const successFields = { ok: z.literal(true), requestId: RequestIdSchema };
const SuccessSchema = z.discriminatedUnion("kind", [
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
export const AppEventSchema = z
  .object({ kind: z.literal("app.lifecycle"), state: z.literal("ready") })
  .strict();
export type AppEvent = z.infer<typeof AppEventSchema>;
export type EventListener = (event: AppEvent) => void;
export interface DesktopBridge {
  request(command: Command): Promise<Reply>;
  subscribe(listener: EventListener): () => void;
  unsubscribe(listener: EventListener): void;
}
export function bounded(value: unknown): boolean {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" && new TextEncoder().encode(text).length <= MAX_MESSAGE_BYTES;
  } catch {
    return false;
  }
}
export function failure(
  code: z.infer<typeof ErrorSchema>["code"],
  requestId: z.infer<typeof RequestIdSchema> | null = null,
): Reply {
  const messages = {
    VALIDATION_ERROR: "Invalid application command.",
    UNTRUSTED_SENDER: "This frame cannot access the application.",
    INTERNAL_ERROR: "The operation could not be completed.",
    UNAVAILABLE: "Database connections will be available in the next milestone.",
  };
  return {
    ok: false,
    requestId,
    error: { code, message: messages[code], retryable: false, outcome: "failed" },
  };
}
