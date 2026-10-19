import { expect, it } from "vitest";
import { parseDocument } from "./document";
import { searchDocument, type SearchMatch } from "./search";
import { createJsonWorker } from "./worker";
import { isCurrentReply, type JsonReply } from "./protocol";
it("searches collapsed nested keys and decoded values with precise source token ranges", async () => {
  const text = '{"needle":{"a/b":["n\\u0065edle",1e400,null]}}';
  const matches: SearchMatch[] = [];
  expect(
    await searchDocument(parseDocument(text), "needle", (batch) => matches.push(...batch)),
  ).toBe(true);
  expect(matches.map((m) => [m.path, m.kind, text.slice(m.range.start, m.range.end)])).toEqual([
    ["/needle", "key", '"needle"'],
    ["/needle/a~1b/0", "value", '"n\\u0065edle"'],
  ]);
});
it("bounds match batches and observes cancellation while indexing a broad container", async () => {
  const doc = parseDocument("[" + Array.from({ length: 5000 }, () => '"match"').join(",") + "]");
  let yields = 0;
  let batches = 0;
  expect(
    await searchDocument(
      doc,
      "match",
      (batch) => {
        expect(batch.length).toBeLessThanOrEqual(256);
        batches++;
      },
      {
        cancelled: () => yields > 2,
        yield: async () => {
          yields++;
        },
      },
    ),
  ).toBe(false);
  expect(batches).toBe(0);
  const sizes: number[] = [];
  await searchDocument(doc, "match", (b) => sizes.push(b.length), {
    cancelled: () => false,
    yield: async () => {},
  });
  expect(sizes.reduce((a, b) => a + b, 0)).toBe(5000);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(256);
});
it("rejects stale revisions, filters reply identities and keeps invalid text recoverable", async () => {
  const replies: JsonReply[] = [];
  const handle = createJsonWorker(
    (r) => replies.push(r),
    async () => {},
  );
  await handle({ kind: "load", documentId: "a", revision: 0, requestId: "load", text: '{"a":1}' });
  await handle({
    kind: "edit",
    documentId: "a",
    revision: 0,
    requestId: "edit",
    operation: { kind: "text", text: '{"a":' },
  });
  const invalid = replies.at(-1);
  expect(invalid?.kind === "document" && invalid.document.text).toBe('{"a":');
  await handle({
    kind: "edit",
    documentId: "a",
    revision: 0,
    requestId: "stale",
    operation: { kind: "remove", path: "/a" },
  });
  expect(replies.at(-1)?.kind).toBe("error");
  if (!invalid) throw new Error("Missing reply");
  expect(isCurrentReply(invalid, { documentId: "a", revision: 1, requestId: "edit" })).toBe(true);
  expect(isCurrentReply(invalid, { documentId: "b", revision: 1, requestId: "edit" })).toBe(false);
  await handle({
    kind: "edit",
    documentId: "a",
    revision: 1,
    requestId: "undo",
    operation: { kind: "undo" },
  });
  expect(replies.at(-1)?.kind === "document" && replies.at(-1)).toMatchObject({
    revision: 2,
    document: { text: '{"a":1}' },
  });
});
it("delivers cancel messages during scheduled parsing and prevents released jobs publishing documents", async () => {
  const replies: JsonReply[] = [];
  let handle: ReturnType<typeof createJsonWorker>;
  let scheduled = 0;
  handle = createJsonWorker(
    (r) => replies.push(r),
    async () => {
      scheduled++;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (scheduled === 1)
        await handle({
          kind: "cancel",
          documentId: "a",
          revision: 0,
          requestId: "cancel",
          targetRequestId: "load",
        });
    },
  );
  await handle({
    kind: "load",
    documentId: "a",
    revision: 0,
    requestId: "load",
    text: "[" + "0,".repeat(10000) + "0]",
  });
  expect(replies).toContainEqual({
    kind: "cancelled",
    documentId: "a",
    revision: 0,
    requestId: "load",
  });
  expect(replies.some((r) => r.kind === "document")).toBe(false);
  await handle({ kind: "release", documentId: "a", revision: 0, requestId: "release" });
  await handle({ kind: "load", documentId: "a", revision: 0, requestId: "old", text: "null" });
  expect(replies.at(-1)?.kind).toBe("error");
});
it("cancels a large structural edit without publishing it, then accepts the original revision", async () => {
  const replies: JsonReply[] = [];
  let cancelEdit = false;
  let handle: ReturnType<typeof createJsonWorker>;
  handle = createJsonWorker(
    (r) => replies.push(r),
    async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (cancelEdit) {
        cancelEdit = false;
        await handle({
          kind: "cancel",
          documentId: "edit",
          revision: 0,
          requestId: "cancel",
          targetRequestId: "edit-work",
        });
      }
    },
  );
  await handle({
    kind: "load",
    documentId: "edit",
    revision: 0,
    requestId: "load",
    text: "[" + "0,".repeat(2000) + "0]",
  });
  cancelEdit = true;
  await handle({
    kind: "edit",
    documentId: "edit",
    revision: 0,
    requestId: "edit-work",
    operation: { kind: "set", path: "/0", value: { kind: "number", lexeme: "9007199254740993" } },
  });
  expect(replies.at(-1)?.kind).toBe("cancelled");
  await handle({
    kind: "edit",
    documentId: "edit",
    revision: 0,
    requestId: "retry",
    operation: { kind: "set", path: "/0", value: { kind: "null" } },
  });
  expect(replies.at(-1)).toMatchObject({ kind: "document", revision: 1 });
});
it("a newer load wins over a pending parse and other document ids remain independent", async () => {
  const replies: JsonReply[] = [];
  const handle = createJsonWorker((r) => replies.push(r));
  const pending = handle({
    kind: "load",
    documentId: "same",
    revision: 0,
    requestId: "old",
    text: "[" + "0,".repeat(2000) + "0]",
  });
  await handle({ kind: "load", documentId: "same", revision: 1, requestId: "new", text: "1e400" });
  await handle({
    kind: "load",
    documentId: "other",
    revision: 0,
    requestId: "other",
    text: "null",
  });
  await pending;
  expect(
    replies
      .filter((r) => r.kind === "document")
      .map((r) => r.requestId)
      .sort(),
  ).toEqual(["new", "other"]);
  expect(replies.find((r) => r.requestId === "old")?.kind).toBe("cancelled");
});
