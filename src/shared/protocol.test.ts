import { describe, it, expect } from "vitest";
import { bounded, CommandSchema, MAX_MESSAGE_BYTES } from "./protocol";
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
