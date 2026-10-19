import { z } from "zod";
import type { JsonDocument } from "./document";
import type { SearchMatch } from "./search";
const value = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("string"), value: z.string() }),
  z.object({ kind: z.literal("number"), lexeme: z.string() }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({ kind: z.literal("null") }),
  z.object({ kind: z.literal("raw"), text: z.string() }),
]);
const operation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), path: z.string(), value }),
  z.object({ kind: z.literal("add"), path: z.string(), value }),
  z.object({ kind: z.literal("remove"), path: z.string() }),
  z.object({ kind: z.literal("move"), from: z.string(), path: z.string() }),
]);
const identity = {
  documentId: z.string().min(1).max(256),
  revision: z.number().int().nonnegative(),
  requestId: z.string().min(1).max(256),
};
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ ...identity, kind: z.literal("load"), text: z.string() }),
  z.object({
    ...identity,
    kind: z.literal("edit"),
    operation: z.union([
      operation,
      z.object({ kind: z.literal("undo") }),
      z.object({ kind: z.literal("redo") }),
      z.object({ kind: z.literal("text"), text: z.string() }),
    ]),
  }),
  z.object({ ...identity, kind: z.literal("search"), query: z.string().max(4096) }),
  z.object({ ...identity, kind: z.literal("cancel"), targetRequestId: z.string() }),
  z.object({ ...identity, kind: z.literal("release") }),
]);
export type JsonCommand = z.infer<typeof commandSchema>;
type Identity = { documentId: string; revision: number; requestId: string };
export type JsonReply = Identity &
  (
    | { kind: "document"; document: JsonDocument }
    | { kind: "matches"; matches: SearchMatch[] }
    | { kind: "done" | "cancelled" | "released" }
    | { kind: "error"; message: string }
  );
/** UI must compare both identities, including the requestId for replaced searches. */
export function isCurrentReply(reply: JsonReply, expected: Identity): boolean {
  return (
    reply.documentId === expected.documentId &&
    reply.revision === expected.revision &&
    reply.requestId === expected.requestId
  );
}
