import { describe, it, expect } from "vitest";
import { bounded, boundedReply, CommandSchema, MAX_MESSAGE_BYTES } from "./protocol";
describe("command boundary", () => {
  it("accepts only the known command with bounded opaque request identifier", () => {
    expect(CommandSchema.safeParse({ kind: "app.info", requestId: "request-1" }).success).toBe(
      true,
    );
    for (const input of [
      { kind: "app.info", requestId: "x", secret: "hidden" },
      { kind: "app.info", requestId: "" },
      { kind: "app.info", requestId: "x".repeat(129) },
      null,
    ])
      expect(CommandSchema.safeParse(input).success).toBe(false);
  });
  it("bounds UTF-8 bytes and rejects cyclic payloads", () => {
    expect(bounded("é".repeat(MAX_MESSAGE_BYTES / 2))).toBe(false);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(bounded(circular)).toBe(false);
  });
});

describe("operation payload limits", () => {
  it("keeps control replies at 64 KiB while allowing explicitly bounded browse data", () => {
    const large = "x".repeat(100000);
    expect(boundedReply(large, "app.info")).toBe(false);
    expect(boundedReply(large, "rows.fetch")).toBe(true);
    expect(boundedReply(large, "schema.list")).toBe(true);
    const overPage = "x".repeat(16 * 1024 * 1024);
    expect(boundedReply(overPage, "rows.fetch")).toBe(false);
    expect(boundedReply(overPage, "rows.value")).toBe(true);
    expect(boundedReply("x".repeat(32 * 1024 * 1024), "rows.value")).toBe(false);
  });
  it("rejects renderer-authored predicates, oversized pages, and absent session generations", () => {
    const base = {
      kind: "rows.fetch",
      requestId: "browse",
      sessionId: crypto.randomUUID(),
      generation: 1,
      tableId: "42",
    };
    expect(CommandSchema.safeParse(base).success).toBe(true);
    expect(CommandSchema.safeParse({ ...base, pageSize: 1001 }).success).toBe(false);
    expect(CommandSchema.safeParse({ ...base, where: "true" }).success).toBe(false);
    expect(CommandSchema.safeParse({ ...base, generation: undefined }).success).toBe(false);
  });
});
