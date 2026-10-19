import { z } from "zod";
import { ConnectionProfileSchema, SessionIdSchema } from "../shared/protocol";
export const ResolvedConnectionSchema = z
  .object({
    profile: ConnectionProfileSchema,
    password: z.string().max(4096).nullable(),
    sessionId: SessionIdSchema,
    generation: z.number().int().positive(),
    connectTimeoutMs: z.number().int().min(100).max(30000).default(10000),
  })
  .strict();
export type ResolvedConnection = z.input<typeof ResolvedConnectionSchema>;
export const WorkerCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open"), config: ResolvedConnectionSchema }).strict(),
  z.object({ kind: z.literal("close") }).strict(),
]);
export const SessionResultSchema = z
  .object({
    sessionId: SessionIdSchema,
    generation: z.number().int().positive(),
    serverVersion: z.string().max(128),
  })
  .strict();
export type SessionResult = z.infer<typeof SessionResultSchema>;
export const WorkerEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connected"), data: SessionResultSchema }).strict(),
  z.object({ kind: z.literal("disconnected") }).strict(),
  z.object({ kind: z.literal("failed") }).strict(),
]);
