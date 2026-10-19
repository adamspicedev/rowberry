import { expect, it } from "vitest";
import { parseDocument } from "./document";
import { defaultYield, searchDocument, type SearchMatch } from "./search";
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
it("worker rejects standalone raw fragment injections before committing", async () => {
  const replies: JsonReply[] = [];
  const handle = createJsonWorker(
    (r) => replies.push(r),
    async () => {},
  );
  for (const [i, text, path, raw] of [
    [0, '{"a":0}', "/a", '1,"b":2'],
    [1, "[0]", "/0", "1,2"],
    [2, "[0]", "/0", '{"a":1,"a":2}'],
  ] as const) {
    await handle({ kind: "load", documentId: "raw" + i, revision: 0, requestId: "load" + i, text });
    await handle({
      kind: "edit",
      documentId: "raw" + i,
      revision: 0,
      requestId: "edit" + i,
      operation: { kind: "set", path, value: { kind: "raw", text: raw } },
    });
    expect(replies.at(-1)?.kind).toBe("error");
  }
});
it("keeps undo histories worker-side and reports availability and eviction without cloning history", async () => {
  let latest: JsonReply | undefined;
  const handle = createJsonWorker(
    (r) => {
      latest = structuredClone(r);
    },
    async () => {},
  );
  const text = '"' + "x".repeat(2 * 1024 * 1024) + '"';
  await handle({ kind: "load", documentId: "history", revision: 0, requestId: "load", text });
  for (let i = 0; i < 10; i++)
    await handle({
      kind: "edit",
      documentId: "history",
      revision: i,
      requestId: "text" + i,
      operation: { kind: "text", text: text.slice(0, -1) + i + '"' },
    });
  if (latest?.kind !== "document") throw new Error("Missing document");
  expect("past" in latest.document).toBe(false);
  expect("future" in latest.document).toBe(false);
  expect(latest.document.canUndo).toBe(true);
  expect(latest.document.canRedo).toBe(false);
  expect(latest.document.historyTruncated).toBe(true);
  const encoded = JSON.stringify(latest);
  expect(encoded.length).toBeLessThan(text.length * 3);
  expect(encoded).not.toContain('"before"');
  await handle({
    kind: "edit",
    documentId: "history",
    revision: 10,
    requestId: "undo",
    operation: { kind: "undo" },
  });
  if (latest?.kind !== "document") throw new Error("Missing undo document");
  expect(latest.document.canRedo).toBe(true);
  expect(latest.document.text).toBe(text.slice(0, -1) + '8"');
});
it("raw fragment validation yields to cancellation before any source splice commits", async () => {
  const replies: JsonReply[] = [];
  let shouldCancel = false;
  let handle: ReturnType<typeof createJsonWorker>;
  handle = createJsonWorker(
    (r) => replies.push(r),
    async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (shouldCancel) {
        shouldCancel = false;
        await handle({
          kind: "cancel",
          documentId: "fragment",
          revision: 0,
          requestId: "cancel",
          targetRequestId: "fragment-edit",
        });
      }
    },
  );
  await handle({
    kind: "load",
    documentId: "fragment",
    revision: 0,
    requestId: "load",
    text: "[0]",
  });
  shouldCancel = true;
  await handle({
    kind: "edit",
    documentId: "fragment",
    revision: 0,
    requestId: "fragment-edit",
    operation: {
      kind: "set",
      path: "/0",
      value: { kind: "raw", text: "[" + "0,".repeat(10000) + "0]" },
    },
  });
  expect(replies.at(-1)?.kind).toBe("cancelled");
  await handle({
    kind: "edit",
    documentId: "fragment",
    revision: 0,
    requestId: "after",
    operation: { kind: "set", path: "/0", value: { kind: "null" } },
  });
  expect(replies.at(-1)).toMatchObject({
    kind: "document",
    revision: 1,
    document: { text: "[null]" },
  });
});
it("cooperative scheduler serves timer cancellation and concurrent callers without losing wakeups", async () => {
  let cancelled = false;
  const timer = setTimeout(() => {
    cancelled = true;
  }, 0);
  let checkpoints = 0;
  try {
    while (!cancelled && checkpoints < 100000) {
      await defaultYield();
      checkpoints++;
    }
    expect(cancelled).toBe(true);
    expect(checkpoints).toBeLessThan(100000);
    let completed = 0;
    await Promise.all(
      Array.from({ length: 64 }, async () => {
        await defaultYield();
        completed++;
        await defaultYield();
        completed++;
      }),
    );
    expect(completed).toBe(128);
  } finally {
    clearTimeout(timer);
  }
});
