import { expect, test } from "vitest";
import { CommandSchema } from "./protocol";
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
