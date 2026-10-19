import { describe, expect, it } from "vitest";
import { parseDocument, applyOperation, resolvePointer, undo, redo } from "./document";
describe("lossless documents", () => {
  it("preserves numeric lexemes, escaped keys and immutable history", () => {
    const d = parseDocument('{"n":9007199254740993,"e":1e400,"z":-0,"a/b":{"~key":null}}');
    const e = applyOperation(d, {
      kind: "set",
      path: "/a~1b/~0key",
      value: { kind: "string", value: "✓" },
    });
    expect(e.text).toContain("9007199254740993");
    expect(e.text).toContain("1e400");
    expect(e.text).toContain("-0");
    expect(resolvePointer(d, "/a~1b/~0key")?.kind).toBe("null");
    expect(undo(e).text).toBe(d.text);
    expect(redo(undo(e)).text).toBe(e.text);
  });
  it("retains invalid and duplicate source while preventing structural edits", () => {
    for (const text of ['{"a":1,"a":2}', '{"a":']) {
      const d = parseDocument(text);
      expect(d.text).toBe(text);
      expect(d.editable).toBe(false);
      expect(() => applyOperation(d, { kind: "remove", path: "/a" })).toThrow();
    }
  });
});

import { MAX_BYTES, MAX_DEPTH } from "./document";
import { nestedJsonFixture } from "../../tests/fixtures/json/generate";
import { escapePointer, pointerParts } from "./paths";
it("handles hostile, empty and Unicode property names without prototype lookup", () => {
  const doc = parseDocument('{"__proto__":{"constructor":1},"":0,"雪🙂":false}');
  expect(resolvePointer(doc, "/__proto__/constructor")?.kind).toBe("number");
  expect(resolvePointer(doc, "/toString")).toBeUndefined();
  expect(resolvePointer(doc, "/")).toMatchObject({ kind: "number", lexeme: "0" });
  expect(resolvePointer(doc, "/雪🙂")).toMatchObject({ kind: "boolean", value: false });
  expect(pointerParts("/" + escapePointer("a/b~"))).toEqual(["a/b~"]);
  expect(() => pointerParts("/a~2")).toThrow();
});
it("adds, removes and moves array values with one reversible move", () => {
  let doc = parseDocument('{"a":[1,9007199254740993,-0],"b":{}}');
  doc = applyOperation(doc, { kind: "add", path: "/a/1", value: { kind: "null" } });
  expect(doc.text).toBe('{"a":[1,null,9007199254740993,-0],"b":{}}');
  doc = applyOperation(doc, { kind: "move", from: "/a/2", path: "/b/n" });
  expect(doc.text).toBe('{"a":[1,null,-0],"b":{"n":9007199254740993}}');
  expect(undo(doc).text).toBe('{"a":[1,null,9007199254740993,-0],"b":{}}');
  doc = applyOperation(doc, { kind: "remove", path: "/a/0" });
  doc = applyOperation(doc, { kind: "remove", path: "/a/1" });
  doc = applyOperation(doc, { kind: "remove", path: "/a/0" });
  expect(resolvePointer(doc, "/a")).toMatchObject({ kind: "array", children: [] });
  expect(() =>
    applyOperation(doc, { kind: "add", path: "/a/01", value: { kind: "null" } }),
  ).toThrow();
});
it("removes object commas and key ranges correctly and validates typed values", () => {
  const doc = parseDocument('{ "a" : 1, "b" : 2, "c" : 3 }');
  for (const key of ["a", "b", "c"])
    expect(applyOperation(doc, { kind: "remove", path: "/" + key }).editable).toBe(true);
  expect(applyOperation(parseDocument('{"-":1}'), { kind: "remove", path: "/-" }).text).toBe("{}");
  const removed = applyOperation(parseDocument('{"a":1}'), { kind: "remove", path: "/a" });
  expect(removed.text).toBe("{}");
  expect(() =>
    applyOperation(doc, { kind: "set", path: "/a", value: { kind: "number", lexeme: "Infinity" } }),
  ).toThrow();
  expect(() =>
    applyOperation(doc, { kind: "set", path: "/a", value: { kind: "raw", text: '{"x":1,"x":2}' } }),
  ).toThrow();
  expect(() => applyOperation(doc, { kind: "move", from: "", path: "/a/x" })).toThrow();
});
it("retains exact ranges and detects escaped duplicate keys", () => {
  const text = ' {"a\\u002fb": ["雪🙂", 1e400]} ';
  const doc = parseDocument(text);
  const n = resolvePointer(doc, "/a~1b/1");
  expect(n && text.slice(n.start, n.end)).toBe("1e400");
  const duplicate = parseDocument('{"a":1,"\\u0061":2}');
  expect(duplicate.diagnostics[0]?.kind).toBe("duplicate");
  expect(duplicate.root?.kind === "object" && duplicate.root.entries.length).toBe(2);
});
it("supports 100 levels and bounds deeper input and UTF-8 bytes explicitly", () => {
  expect(parseDocument(nestedJsonFixture()).editable).toBe(true);
  expect(parseDocument(nestedJsonFixture(MAX_DEPTH + 1)).diagnostics[0]?.message).toContain(
    "depth",
  );
  const oversized = parseDocument('"' + "雪".repeat(Math.ceil(MAX_BYTES / 3)) + '"');
  expect(oversized.diagnostics[0]?.kind).toBe("limit");
  expect(oversized.text.length).toBeGreaterThan(0);
  expect(oversized.root).toBeNull();
});
it("rejects invalid grammar while retaining recoverable source", () => {
  for (const text of [
    "[1,]",
    '{"a":1,}',
    "01",
    "1.",
    "NaN",
    "\u00a0",
    "[\u000c]",
    "true false",
    '{"a" 1}',
    "[true false]",
    '"\\q"',
    '"\n"',
    "[}",
  ]) {
    const doc = parseDocument(text);
    expect(doc.editable, text).toBe(false);
    expect(doc.text).toBe(text);
  }
});
it("accepts exactly 32 MiB UTF-8 without truncation", () => {
  const text = '"' + "x".repeat(MAX_BYTES - 2) + '"';
  const doc = parseDocument(text);
  expect(doc.editable).toBe(true);
  expect(doc.root?.end).toBe(MAX_BYTES);
  expect(doc.text).toBe(text);
});
it("rejects raw fragments that inject siblings instead of exactly one standalone value", () => {
  for (const [text, path, raw] of [
    ['{"a":0}', "/a", '1,"b":2'],
    ["[0]", "/0", "1,2"],
    ['{"a":0}', "/a", '{"x":1,"x":2}'],
  ]) {
    if (!text || !path || !raw) throw new Error("Fixture missing");
    expect(() =>
      applyOperation(parseDocument(text), { kind: "set", path, value: { kind: "raw", text: raw } }),
    ).toThrow();
  }
});

import { MAX_HISTORY_BYTES, recordTextEdit } from "./document";
it("evicts oldest text and move history by retained bytes while preserving current source", () => {
  const value = "x".repeat(2 * 1024 * 1024);
  let textDoc = parseDocument(JSON.stringify(value));
  for (let i = 0; i < 10; i++)
    textDoc = recordTextEdit(textDoc, parseDocument(JSON.stringify(value + i)));
  expect(textDoc.historyBytes).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
  expect(textDoc.historyTruncated).toBe(true);
  expect(textDoc.past.length).toBeGreaterThan(0);
  expect(undo(textDoc).text).toBe(JSON.stringify(value + 8));
  expect(redo(undo(textDoc)).text).toBe(textDoc.text);
  let moved = parseDocument('{"a":' + JSON.stringify(value) + ',"b":[]}');
  for (let i = 0; i < 10; i++)
    moved = applyOperation(
      moved,
      i % 2 === 0
        ? { kind: "move", from: "/a", path: "/b/-" }
        : { kind: "move", from: "/b/0", path: "/a" },
    );
  expect(moved.historyBytes).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
  expect(moved.historyTruncated).toBe(true);
  expect(resolvePointer(moved, "/a")?.kind).toBe("string");
  expect(redo(undo(moved)).text).toBe(moved.text);
});
it("clears undo with visible metadata when one edit exceeds the entire history budget", () => {
  const text = '"' + "x".repeat(17 * 1024 * 1024) + '"';
  const doc = parseDocument(text);
  const edited = recordTextEdit(doc, doc);
  expect(edited.text).toBe(text);
  expect(edited.past).toEqual([]);
  expect(edited.future).toEqual([]);
  expect(edited.historyTruncated).toBe(true);
  expect(edited.historyBytes).toBe(0);
  expect(undo(edited)).toBe(edited);
});
