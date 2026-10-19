import { z } from "zod";
export const REQUEST_CHANNEL = "dbapp:request";
export const EVENT_CHANNEL = "dbapp:event";
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const RequestIdSchema = z.string().min(1).max(128).brand<"RequestId">();
export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("app.info"), requestId: RequestIdSchema }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;
export const ErrorSchema = z
  .object({
    code: z.enum(["VALIDATION_ERROR", "UNTRUSTED_SENDER", "INTERNAL_ERROR"]),
    message: z.string().max(256),
    retryable: z.boolean(),
    outcome: z.enum(["failed", "unknown"]),
  })
  .strict();
export const ReplySchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      requestId: RequestIdSchema,
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
  };
  return {
    ok: false,
    requestId,
    error: { code, message: messages[code], retryable: false, outcome: "failed" },
  };
}
