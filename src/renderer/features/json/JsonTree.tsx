/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtualized tree items require positioned ARIA tree semantics. */
import { useMemo, useRef, useState, useEffect } from "react";
import type { JsonNode } from "../../../json/document";
import { escapePointer } from "../../../json/paths";
export type RevealRequest = { path: string; token: number };
export type TreeRow = {
  node: JsonNode;
  path: string;
  label: string;
  depth: number;
  parent: string | null;
};
export function JsonTree({
  root,
  selected,
  reveal,
  onSelect,
}: {
  root: JsonNode;
  selected: string;
  reveal: RevealRequest;
  onSelect: (row: TreeRow) => void;
}) {
  const [expanded, setExpanded] = useState(new Set([""]));
  const [top, setTop] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    queueMicrotask(() =>
      setExpanded((old) => {
        const next = new Set(old);
        const parts = reveal.path.split("/");
        for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
        return next;
      }),
    );
  }, [reveal]);
  const rows = useMemo(() => {
    const result: TreeRow[] = [];
    const stack: TreeRow[] = [{ node: root, path: "", label: "$", depth: 0, parent: null }];
    while (stack.length) {
      const row = stack.pop();
      if (!row) break;
      result.push(row);
      if (!expanded.has(row.path)) continue;
      if (row.node.kind === "object")
        for (let i = row.node.entries.length - 1; i >= 0; i--) {
          const entry = row.node.entries[i];
          if (entry)
            stack.push({
              node: entry.value,
              path: row.path + "/" + escapePointer(entry.key),
              label: entry.key,
              depth: row.depth + 1,
              parent: row.path,
            });
        }
      if (row.node.kind === "array")
        for (let i = row.node.children.length - 1; i >= 0; i--) {
          const node = row.node.children[i];
          if (node)
            stack.push({
              node,
              path: row.path + "/" + i,
              label: String(i),
              depth: row.depth + 1,
              parent: row.path,
            });
        }
    }
    return result;
  }, [root, expanded]);
  useEffect(() => {
    const index = rows.findIndex((row) => row.path === reveal.path);
    if (index >= 0) host.current?.scrollTo({ top: Math.max(0, index * 28 - 84) });
  }, [rows, reveal]);
  function toggle(path: string) {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  const first = Math.max(0, Math.floor(top / 28) - 4);
  return (
    <div
      className="json-tree"
      role="tree"
      aria-label="JSON tree"
      tabIndex={0}
      ref={host}
      onScroll={(event) => setTop(event.currentTarget.scrollTop)}
      onKeyDown={(event) => {
        const index = rows.findIndex((row) => row.path === selected);
        const row = rows[index];
        if (!row) return;
        if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key))
          event.preventDefault();
        if (event.key === "ArrowRight" && !expanded.has(row.path)) toggle(row.path);
        if (event.key === "ArrowLeft") {
          if (expanded.has(row.path)) toggle(row.path);
          else {
            const parent = rows.find((item) => item.path === row.parent);
            if (parent) onSelect(parent);
          }
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
          if (next) {
            onSelect(next);
            host.current?.scrollTo({
              top: Math.max(0, (index + (event.key === "ArrowDown" ? 1 : -1)) * 28 - 84),
            });
          }
        }
      }}
    >
      <div style={{ height: rows.length * 28, position: "relative" }}>
        {rows.slice(first, first + 36).map((row, index) => {
          const container = row.node.kind === "object" || row.node.kind === "array";
          return (
            <div
              tabIndex={-1}
              onKeyDown={() => {}}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={selected === row.path}
              aria-expanded={container ? expanded.has(row.path) : undefined}
              key={row.node.start}
              className="json-tree-row"
              style={{
                position: "absolute",
                top: (first + index) * 28,
                paddingLeft: row.depth * 18,
              }}
              onClick={() => onSelect(row)}
              onDoubleClick={() => container && toggle(row.path)}
            >
              <button
                tabIndex={-1}
                aria-label={`Expand ${row.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(row.path);
                }}
              >
                {container ? (expanded.has(row.path) ? "▾" : "▸") : "·"}
              </button>
              <span>{row.label}</span>
              <small>
                {row.node.kind === "string"
                  ? JSON.stringify(row.node.value).slice(0, 160)
                  : row.node.kind === "number"
                    ? row.node.lexeme
                    : row.node.kind === "boolean"
                      ? String(row.node.value)
                      : row.node.kind === "object"
                        ? `{${row.node.entries.length}}`
                        : row.node.kind === "array"
                          ? `[${row.node.children.length}]`
                          : "null"}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
