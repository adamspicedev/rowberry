import { pointerParts } from "./paths";
export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_DEPTH = 256;
export type Range = { readonly start: number; readonly end: number };
export type JsonNode = Range &
  (
    | { readonly kind: "object"; readonly entries: readonly Entry[] }
    | { readonly kind: "array"; readonly children: readonly JsonNode[] }
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "number"; readonly lexeme: string }
    | { readonly kind: "boolean"; readonly value: boolean }
    | { readonly kind: "null" }
  );
export type Entry = { readonly key: string; readonly keyRange: Range; readonly value: JsonNode };
export type Diagnostic = Range & {
  readonly kind: "syntax" | "duplicate" | "limit";
  readonly message: string;
};
export type SourceEdit = {
  readonly start: number;
  readonly before: string;
  readonly after: string;
};
export type JsonDocument = {
  readonly text: string;
  readonly root: JsonNode | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly editable: boolean;
  readonly revision: number;
  readonly past: readonly SourceEdit[];
  readonly future: readonly SourceEdit[];
};
type Token = Range & { raw: string };
function* tokens(text: string): Generator<Token | null> {
  let i = 0;
  while (i < text.length) {
    const start = i;
    const c = text[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      i++;
    } else if (c === '"') {
      i++;
      let escaped = false;
      let closed = false;
      while (i < text.length) {
        const ch = text[i++];
        if (!escaped && ch === '"') {
          closed = true;
          break;
        }
        if (!escaped && ch === "\\") escaped = true;
        else escaped = false;
        if (i % 8192 === 0) yield null;
      }
      if (!closed) throw new Error("Unterminated string");
      yield { start, end: i, raw: text.slice(start, i) };
    } else if (c && "{}[]:,".includes(c)) {
      i++;
      yield { start, end: i, raw: c };
    } else {
      while (i < text.length && !/[ \t\r\n{}[\]:,]/u.test(text[i] ?? "")) {
        i++;
        if (i % 8192 === 0) yield null;
      }
      yield { start, end: i, raw: text.slice(start, i) };
    }
    if (i % 8192 === 0) yield null;
  }
}
type Frame = {
  kind: "object" | "array";
  start: number;
  entries: Entry[];
  children: JsonNode[];
  state: "first" | "value" | "key" | "colon" | "comma";
  key?: Token;
  keys: Set<string>;
};
/** Cooperative parser. Null yields are scheduling checkpoints; no structural JSON.parse. */
export function* documentSteps(text: string): Generator<null, JsonDocument> {
  const diagnostics: Diagnostic[] = [];
  let root: JsonNode | null = null;
  const stack: Frame[] = [];
  const base = (): JsonDocument => ({
    text,
    root,
    diagnostics,
    editable: root !== null && diagnostics.length === 0,
    revision: 0,
    past: [],
    future: [],
  });
  // Count UTF-8 without allocating a second full input buffer.
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes +=
      c < 128
        ? 1
        : c < 2048
          ? 2
          : c >= 0xd800 &&
              c <= 0xdbff &&
              text.charCodeAt(i + 1) >= 0xdc00 &&
              text.charCodeAt(i + 1) <= 0xdfff
            ? (i++, 4)
            : 3;
    if (bytes > MAX_BYTES) {
      diagnostics.push({
        kind: "limit",
        start: 0,
        end: text.length,
        message:
          "JSON exceeds the 32 MiB UTF-8 editing limit. Copy or export the original value; no partial save is supported.",
      });
      return base();
    }
    if (i % 8192 <= 1) yield null;
  }
  const accept = (node: JsonNode) => {
    const f = stack.at(-1);
    if (!f) {
      if (root) throw new Error("Multiple root values");
      root = node;
      return;
    }
    if (f.kind === "array") f.children.push(node);
    else {
      if (!f.key) throw new Error("Missing object key");
      const key: string = JSON.parse(f.key.raw);
      if (f.keys.has(key))
        diagnostics.push({
          ...f.key,
          kind: "duplicate",
          message: "Duplicate object key; edit source text to disambiguate before tree edits.",
        });
      f.keys.add(key);
      f.entries.push({ key, keyRange: { start: f.key.start, end: f.key.end }, value: node });
    }
    f.state = "comma";
  };
  let position = 0;
  try {
    for (const token of tokens(text)) {
      yield null;
      if (!token) continue;
      position = token.start;
      const f = stack.at(-1);
      const raw = token.raw;
      if (f && (raw === "}" || raw === "]")) {
        if (
          raw !== (f.kind === "object" ? "}" : "]") ||
          (f.state !== "first" && f.state !== "comma")
        )
          throw new Error("Unexpected closing delimiter");
        stack.pop();
        accept(
          f.kind === "object"
            ? { kind: "object", start: f.start, end: token.end, entries: f.entries }
            : { kind: "array", start: f.start, end: token.end, children: f.children },
        );
        continue;
      }
      if (f?.state === "comma") {
        if (raw !== ",") throw new Error("Expected comma");
        f.state = f.kind === "object" ? "key" : "value";
        continue;
      }
      if (f?.kind === "object" && (f.state === "first" || f.state === "key")) {
        if (!raw.startsWith('"')) throw new Error("Expected object key");
        JSON.parse(raw);
        f.key = token;
        f.state = "colon";
        continue;
      }
      if (f?.state === "colon") {
        if (raw !== ":") throw new Error("Expected colon");
        f.state = "value";
        continue;
      }
      if (raw === "{" || raw === "[") {
        if (stack.length >= MAX_DEPTH) throw new Error(`Maximum nesting depth is ${MAX_DEPTH}`);
        stack.push({
          kind: raw === "{" ? "object" : "array",
          start: token.start,
          entries: [],
          children: [],
          state: "first",
          keys: new Set(),
        });
        continue;
      }
      const range = { start: token.start, end: token.end };
      if (raw.startsWith('"')) {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== "string") throw new Error("Invalid string");
        accept({ ...range, kind: "string", value });
      } else if (raw === "null") accept({ ...range, kind: "null" });
      else if (raw === "true" || raw === "false")
        accept({ ...range, kind: "boolean", value: raw === "true" });
      else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(raw))
        accept({ ...range, kind: "number", lexeme: raw });
      else throw new Error("Invalid JSON value");
    }
    if (stack.length || !root) throw new Error("Incomplete JSON document");
  } catch (error) {
    root = null;
    diagnostics.push({
      kind: "syntax",
      start: position,
      end: Math.min(position + 1, text.length),
      message: error instanceof Error ? error.message : "Invalid JSON",
    });
  }
  return base();
}
export function parseDocument(text: string): JsonDocument {
  const steps = documentSteps(text);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
export function resolvePointer(doc: JsonDocument, path: string): JsonNode | undefined {
  let node = doc.root ?? undefined;
  for (const part of pointerParts(path)) {
    if (node?.kind === "object") node = node.entries.find((e) => e.key === part)?.value;
    else if (node?.kind === "array" && /^(?:0|[1-9]\d*)$/u.test(part))
      node = node.children[Number(part)];
    else return undefined;
  }
  return node;
}
export type JsonValue =
  | { kind: "string"; value: string }
  | { kind: "number"; lexeme: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "raw"; text: string };
export type Operation =
  | { kind: "set" | "add"; path: string; value: JsonValue }
  | { kind: "remove"; path: string }
  | { kind: "move"; from: string; path: string };
function valueText(v: JsonValue): string {
  switch (v.kind) {
    case "string":
      return JSON.stringify(v.value);
    case "boolean":
      return v.value ? "true" : "false";
    case "null":
      return "null";
    case "number":
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(v.lexeme))
        throw new Error("Invalid numeric lexeme");
      return v.lexeme;
    case "raw":
      return v.text;
  }
}
function change(
  doc: JsonDocument,
  start: number,
  end: number,
  after: string,
  reparse: (text: string) => JsonDocument,
): JsonDocument {
  const edit = { start, before: doc.text.slice(start, end), after };
  const result = reparse(doc.text.slice(0, start) + after + doc.text.slice(end));
  if (!result.editable) throw new Error(result.diagnostics[0]?.message ?? "Invalid edit");
  return { ...result, revision: doc.revision + 1, past: [...doc.past, edit], future: [] };
}
export function applyOperation(
  doc: JsonDocument,
  op: Operation,
  reparse: (text: string) => JsonDocument = parseDocument,
): JsonDocument {
  if (!doc.editable) throw new Error("Tree edits require valid JSON without duplicate keys");
  if (op.kind === "move") {
    if (op.from === op.path) return doc;
    if (op.path.startsWith(op.from + "/")) throw new Error("Cannot move into a descendant");
    const source = resolvePointer(doc, op.from);
    if (!source) throw new Error("Missing move source");
    const removed = applyOperation(doc, { kind: "remove", path: op.from });
    const added = applyOperation(removed, {
      kind: "add",
      path: op.path,
      value: { kind: "raw", text: doc.text.slice(source.start, source.end) },
    });
    return {
      ...added,
      revision: doc.revision + 1,
      past: [...doc.past, { start: 0, before: doc.text, after: added.text }],
      future: [],
    };
  }
  const parts = pointerParts(op.path);
  const node = resolvePointer(doc, op.path);
  if (op.kind === "set") {
    if (!node) throw new Error("Missing target");
    return change(doc, node.start, node.end, valueText(op.value), reparse);
  }
  if (parts.length === 0) throw new Error("Cannot add or remove document root; use set");
  const key = parts.pop();
  if (key === undefined) throw new Error("Missing key");
  const parentPath = op.path.slice(0, op.path.lastIndexOf("/"));
  const parent = resolvePointer(doc, parentPath);
  if (!parent || (parent.kind !== "object" && parent.kind !== "array"))
    throw new Error("Expected container");
  const children = parent.kind === "array" ? parent.children : parent.entries.map((e) => e.value);
  let index =
    parent.kind === "object"
      ? parent.entries.findIndex((e) => e.key === key)
      : key === "-"
        ? children.length
        : /^(?:0|[1-9]\d*)$/u.test(key)
          ? Number(key)
          : -1;
  if (op.kind === "add") {
    if (parent.kind === "object" && index >= 0) throw new Error("Property exists; use set");
    if (parent.kind === "object") index = children.length;
    if (index < 0 || index > children.length) throw new Error("Invalid insertion index");
    const content =
      (parent.kind === "object" ? JSON.stringify(key) + ":" : "") + valueText(op.value);
    const next = children[index];
    if (next) return change(doc, next.start, next.start, content + ",", reparse);
    return change(
      doc,
      parent.end - 1,
      parent.end - 1,
      (children.length ? "," : "") + content,
      reparse,
    );
  }
  if (index < 0 || index >= children.length || (parent.kind === "array" && key === "-"))
    throw new Error("Missing target");
  const target = children[index];
  if (!target) throw new Error("Missing target");
  const entry = parent.kind === "object" ? parent.entries[index] : undefined;
  const start = entry?.keyRange.start ?? target.start;
  const next = children[index + 1];
  const previous = children[index - 1];
  if (next) {
    const nextStart =
      parent.kind === "object" ? parent.entries[index + 1]?.keyRange.start : next.start;
    return change(doc, start, nextStart ?? next.start, "", reparse);
  }
  return change(doc, previous?.end ?? start, target.end, "", reparse);
}
export function undo(
  doc: JsonDocument,
  reparse: (text: string) => JsonDocument = parseDocument,
): JsonDocument {
  const e = doc.past.at(-1);
  if (!e) return doc;
  return {
    ...reparse(doc.text.slice(0, e.start) + e.before + doc.text.slice(e.start + e.after.length)),
    revision: doc.revision + 1,
    past: doc.past.slice(0, -1),
    future: [...doc.future, e],
  };
}
export function redo(
  doc: JsonDocument,
  reparse: (text: string) => JsonDocument = parseDocument,
): JsonDocument {
  const e = doc.future.at(-1);
  if (!e) return doc;
  return {
    ...reparse(doc.text.slice(0, e.start) + e.after + doc.text.slice(e.start + e.before.length)),
    revision: doc.revision + 1,
    past: [...doc.past, e],
    future: doc.future.slice(0, -1),
  };
}
