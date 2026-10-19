import { expect, test } from "vitest";
import { CommandSchema, boundedCommand, boundedReply } from "./protocol";
test("SQL commands validate ownership, page and text limits", () => {
  const owner = {
    requestId: "q",
    sessionId: crypto.randomUUID(),
    generation: 1,
    tabId: crypto.randomUUID(),
  };
  expect(CommandSchema.safeParse({ kind: "queries.openTab", ...owner }).success).toBe(true);
  expect(
    CommandSchema.safeParse({ kind: "queries.start", ...owner, sql: "SELECT 1" }).success,
  ).toBe(true);
  expect(
    CommandSchema.safeParse({ kind: "queries.start", ...owner, sql: "é".repeat(524289) }).success,
  ).toBe(false);
  expect(
    CommandSchema.safeParse({
      kind: "queries.fetch",
      ...owner,
      queryId: crypto.randomUUID(),
      pageSize: 1001,
    }).success,
  ).toBe(false);
  expect(
    CommandSchema.safeParse({ kind: "queries.openTab", ...owner, password: "secret" }).success,
  ).toBe(false);
});

test("SQL UTF-8 limit allows worst-case JSON escaping in commands and saved replies", () => {
  const owner = {
    requestId: "escape",
    sessionId: crypto.randomUUID(),
    generation: 1,
    tabId: crypto.randomUUID(),
  };
  const sql = "/*" + "\n".repeat(600000) + "*/ SELECT 1";
  const command = { kind: "queries.start", ...owner, sql };
  expect(CommandSchema.safeParse(command).success).toBe(true);
  expect(boundedCommand(command)).toBe(true);
  expect(
    boundedReply(
      {
        ok: true,
        kind: "queries.saved.get",
        requestId: "escape",
        data: { id: crypto.randomUUID(), name: "escaped", sql },
      },
      "queries.saved.get",
    ),
  ).toBe(true);
  const worst = "\u0000".repeat(1024 * 1024);
  expect(
    boundedCommand({
      kind: "queries.saved.save",
      requestId: "escape",
      id: crypto.randomUUID(),
      name: "worst",
      sql: worst,
    }),
  ).toBe(true);
  expect(boundedCommand({ sql: "\u0000".repeat(1024 * 1024 + 2048) })).toBe(false);
  expect(CommandSchema.safeParse({ ...command, sql: sql + "x".repeat(1024 * 1024) }).success).toBe(
    false,
  );
});
