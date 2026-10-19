import { expect, test } from "vitest";
import { boundedCommand, boundedReply, CommandSchema } from "./protocol";
test("save transport accepts escaped JSON above ordinary command budget and rejects raw overflow", () => {
  const request = {
    kind: "rows.save",
    requestId: "save",
    sessionId: crypto.randomUUID(),
    generation: 1,
    changes: [
      { target: crypto.randomUUID(), values: { payload: '"' + "\\u0000".repeat(180000) + '"' } },
    ],
  };
  expect(CommandSchema.safeParse(request).success).toBe(true);
  expect(boundedCommand(request)).toBe(true);
  expect(
    boundedCommand({
      ...request,
      changes: [{ target: crypto.randomUUID(), values: { payload: "😀".repeat(9 * 1024 * 1024) } }],
    }),
  ).toBe(false);
  expect(boundedReply({ message: "x".repeat(70000) }, "rows.save")).toBe(true);
});
