/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtualized tree items require positioned ARIA tree semantics. */
import { useMemo, useRef, useState, useEffect, useEffectEvent } from "react";
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
  filter,
  action,
  selected,
  reveal,
  onSelect,
}: {
  filter: Set<string> | null;
  action: { kind: "expand" | "collapse"; token: number };
  root: JsonNode;
  selected: string;
  reveal: RevealRequest;
  onSelect: (row: TreeRow) => void;
}) {
  const [expanded, setExpanded] = useState(new Set([""]));
  const [filterCollapsed, setFilterCollapsed] = useState(new Set<string>());
  const [allExpanded, setAllExpanded] = useState(false);
  const [top, setTop] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const revealAncestors = useEffectEvent(() => {
    setFilterCollapsed(new Set());
    setExpanded((old) => {
      const next = new Set(old);
      const parts = reveal.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join("/");
        if (allExpanded) next.delete(ancestor);
        else next.add(ancestor);
      }
      return next;
    });
  });
  useEffect(() => {
    queueMicrotask(() => revealAncestors());
  }, [reveal]);
  const applyAction = useEffectEvent(() => {
    setFilterCollapsed(action.kind === "collapse" && filter ? new Set(filter) : new Set());
    setAllExpanded(action.kind === "expand");
    setExpanded(new Set(action.kind === "expand" ? [] : [""]));
  });
  useEffect(() => {
    if (action.token) queueMicrotask(() => applyAction());
  }, [action]);
  useEffect(() => {
    host.current?.scrollTo({ top: 0 });
    queueMicrotask(() => {
      setTop(0);
      setFilterCollapsed(new Set());
    });
  }, [filter]);
  const isExpanded = (path: string) =>
    filter ? !filterCollapsed.has(path) : allExpanded !== expanded.has(path);
  const rows = useMemo(() => {
    const result: TreeRow[] = [];
    const stack: TreeRow[] = [{ node: root, path: "", label: "$", depth: 0, parent: null }];
    while (stack.length) {
      const row = stack.pop();
      if (!row) break;
      if (filter && !filter.has(row.path)) continue;
      result.push(row);
      if (!(filter ? !filterCollapsed.has(row.path) : allExpanded !== expanded.has(row.path)))
        continue;
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
  }, [root, expanded, allExpanded, filter, filterCollapsed]);
  useEffect(() => {
    const index = rows.findIndex((row) => row.path === reveal.path);
    if (index >= 0) host.current?.scrollTo({ top: Math.max(0, index * 28 - 84) });
  }, [rows, reveal]);
  function toggle(path: string) {
    if (filter) {
      setFilterCollapsed((old) => {
        const next = new Set(old);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      return;
    }
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
        if (event.key === "ArrowRight" && !isExpanded(row.path)) toggle(row.path);
        if (event.key === "ArrowLeft") {
          if (isExpanded(row.path)) toggle(row.path);
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
              aria-expanded={container ? isExpanded(row.path) : undefined}
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
                disabled={!container}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(row.path);
                }}
              >
                {container ? (isExpanded(row.path) ? "▾" : "▸") : "·"}
              </button>
              <span className="json-key">
                {row.path ? JSON.stringify(row.label) : "$"}
                {row.path ? ":" : ""}
              </span>
              <small className={`json-value json-${row.node.kind}`}>
                {row.node.kind === "string"
                  ? JSON.stringify(row.node.value).slice(0, 160)
                  : row.node.kind === "number"
                    ? row.node.lexeme
                    : row.node.kind === "boolean"
                      ? String(row.node.value)
                      : row.node.kind === "object"
                        ? `{ ${row.node.entries.length} keys }`
                        : row.node.kind === "array"
                          ? `[ ${row.node.children.length} items ]`
                          : "null"}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
