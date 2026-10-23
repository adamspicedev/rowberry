import { copyText } from "../../app/clipboard";
import { useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import { RequestIdSchema, type SessionId } from "../../../shared/protocol";
import type { Table } from "../../../shared/browse";
import { Button } from "../../components/ui/button";
import { useFeedback, type MenuItem } from "../../app/Feedback";
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
export function SchemaSidebar({
  sessionId,
  generation,
  selected,
  onSelect,
  onQuery,
}: {
  sessionId: SessionId;
  generation: number;
  selected: string | null;
  onSelect: (table: Table) => void;
  onQuery: (sql: string) => void;
}) {
  const { menu, closeMenu, toast } = useFeedback();
  const [tables, setTables] = useState<Table[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("Loading schemas…");
  const [reload, setReload] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [structure, setStructure] = useState<Table | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => closeMenu, [closeMenu, sessionId, generation]);
  useEffect(() => {
    if (structure) dialog.current?.showModal();
  }, [structure]);
  useEffect(() => {
    let active = true;
    void window.dbapp
      .request({
        kind: "schema.list",
        sessionId,
        generation,
        requestId: RequestIdSchema.parse(crypto.randomUUID()),
      })
      .then((reply) => {
        if (!active) return;
        if (reply.ok && reply.kind === "schema.list") {
          setTables(reply.data.tables);
          setState(reply.data.tables.length ? "" : "No accessible tables.");
          if (reload) toast("Schema refreshed");
        } else {
          setState("Could not load schemas. Check the connection, then refresh.");
          toast("Could not refresh schemas", { error: true });
        }
      })
      .catch(() => {
        if (active) setState("Could not load schemas. Check the connection, then refresh.");
      });
    return () => {
      active = false;
    };
  }, [sessionId, generation, reload, toast]);
  const refresh = () => {
    closeMenu();
    setState("Loading schemas…");
    setReload((n) => n + 1);
  };
  const toggle = (set: typeof setExpanded, value: string) =>
    set((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const copy = async (text: string) => {
    if (copyText(text)) toast("Name copied");
    else toast("Clipboard unavailable. Try copying again.", { error: true });
  };
  function showMenu(
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    label: string,
    items: MenuItem[],
  ) {
    if ("key" in event && event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
      return;
    event.preventDefault();
    const trigger = event.currentTarget;
    const bounds = trigger.getBoundingClientRect();
    menu({
      label,
      trigger,
      items,
      x:
        event.type === "contextmenu" && "clientX" in event && event.clientX
          ? event.clientX
          : bounds.left,
      y:
        event.type === "contextmenu" && "clientY" in event && event.clientY
          ? event.clientY
          : bounds.bottom,
    });
  }
  const actions = (table: Table): MenuItem[] => [
    { label: "View data", action: () => onSelect(table) },
    { label: "View structure", action: () => setStructure(table) },
    {
      label: "SQL: Select top 200",
      separator: true,
      action: () =>
        onQuery(`SELECT *\nFROM ${quote(table.schema)}.${quote(table.name)}\nLIMIT 200;`),
    },
    { label: "Copy name", separator: true, action: () => copy(table.name) },
    {
      label: "Copy qualified name",
      action: () => copy(`${quote(table.schema)}.${quote(table.name)}`),
    },
    {
      label: "Hide from sidebar",
      separator: true,
      action: () => {
        setHidden((current) => new Set(current).add(table.id));
        toast(`Hidden ${table.name}`, {
          action: {
            label: "Undo",
            run: () =>
              setHidden((current) => {
                const next = new Set(current);
                next.delete(table.id);
                return next;
              }),
          },
        });
      },
    },
    { label: "Refresh schemas", action: refresh },
  ];
  const visible = tables.filter(
    (table) =>
      !hidden.has(table.id) &&
      `${table.schema}.${table.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const groups = new Map<string, Table[]>();
  for (const table of visible) {
    const group = groups.get(table.schema);
    if (group) group.push(table);
    else groups.set(table.schema, [table]);
  }
  const schemas = [...groups.keys()].sort();
  return (
    <section className="schema-sidebar" aria-label="Database schemas">
      <div className="schema-heading">
        <strong>
          Entities <span className="entity-count">{visible.length}</span>
        </strong>
        <Button variant="ghost" onClick={refresh} aria-label="Refresh schemas">
          ↻
        </Button>
      </div>
      <input
        aria-label="Search schemas and tables"
        placeholder="Filter tables…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {state && <output className="schema-message">{state}</output>}
      {!state && !visible.length && <p>No matching tables.</p>}
      {hidden.size > 0 && (
        <button className="show-hidden" onClick={() => setHidden(new Set())}>
          Show hidden tables ({hidden.size})
        </button>
      )}
      <ul className="entity-schemas">
        {schemas.map((schema) => (
          <li key={schema}>
            <button
              className="schema-folder"
              aria-expanded={!!search || !collapsed.has(schema)}
              onClick={() => toggle(setCollapsed, schema)}
            >
              <span aria-hidden="true">{search || !collapsed.has(schema) ? "⌄" : "›"} ▱</span>{" "}
              {schema}
            </button>
            {(search || !collapsed.has(schema)) && (
              <ul className="entity-tables">
                {groups.get(schema)!.map((table) => (
                  <li key={table.id}>
                    <div className={`entity-row ${selected === table.id ? "selected" : ""}`}>
                      <button
                        className="entity-expand"
                        aria-label={`${expanded.has(table.id) ? "Collapse" : "Expand"} ${table.schema}.${table.name} columns`}
                        aria-expanded={expanded.has(table.id)}
                        onClick={() => toggle(setExpanded, table.id)}
                      >
                        {expanded.has(table.id) ? "⌄" : "›"}
                      </button>
                      <button
                        className="entity-name"
                        aria-label={`${table.name} ${table.schema} · ${table.kind}${!table.key.length ? " · read-only" : ""}`}
                        aria-pressed={selected === table.id}
                        title={`${table.schema}.${table.name} · ${table.kind}`}
                        onClick={() => onSelect(table)}
                        onContextMenu={(event) =>
                          showMenu(event, `${table.name} actions`, actions(table))
                        }
                        onKeyDown={(event) =>
                          showMenu(event, `${table.name} actions`, actions(table))
                        }
                      >
                        <span className="entity-icon" aria-hidden="true">
                          {table.kind === "table" ? "▦" : "▤"}
                        </span>
                        <span>{table.name}</span>
                      </button>
                      <button
                        className="entity-more"
                        aria-label={`Actions for ${table.schema}.${table.name}`}
                        onClick={(event) =>
                          showMenu(event, `${table.name} actions`, actions(table))
                        }
                      >
                        ⋯
                      </button>
                    </div>
                    {expanded.has(table.id) && (
                      <ul className="entity-columns">
                        {table.columns.map((column) => (
                          <li key={column.name}>
                            <button
                              title={`${column.name}: ${column.typeName}${table.key.includes(column.name) ? " · key" : ""}`}
                              onClick={() => setStructure(table)}
                              onContextMenu={(event) =>
                                showMenu(event, `${column.name} actions`, [
                                  { label: "Copy column name", action: () => copy(column.name) },
                                  { label: "View structure", action: () => setStructure(table) },
                                ])
                              }
                              onKeyDown={(event) =>
                                showMenu(event, `${column.name} actions`, [
                                  { label: "Copy column name", action: () => copy(column.name) },
                                  { label: "View structure", action: () => setStructure(table) },
                                ])
                              }
                            >
                              <span>
                                {table.key.includes(column.name) && (
                                  <span className="column-key" aria-label="Key column">
                                    ◆{" "}
                                  </span>
                                )}
                                {column.name}
                              </span>
                              <small>{column.typeName}</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {structure && (
        <dialog
          ref={dialog}
          className="structure-dialog"
          aria-labelledby="structure-title"
          onClose={() => setStructure(null)}
        >
          <div className="structure-heading">
            <div>
              <h2 id="structure-title">
                {structure.schema}.{structure.name}
              </h2>
              <p>
                {structure.kind} · {structure.columns.length} columns
                {structure.rls ? " · Row-level security enabled" : ""}
              </p>
            </div>
            <button aria-label="Close structure" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Nullable</th>
                <th>Attributes</th>
              </tr>
            </thead>
            <tbody>
              {structure.columns.map((column) => (
                <tr key={column.name}>
                  <td>{column.name}</td>
                  <td>{column.typeName}</td>
                  <td>{column.nullable ? "Yes" : "No"}</td>
                  <td>
                    {[
                      structure.key.includes(column.name) ? "Key" : "",
                      column.identity ? "Identity" : "",
                      column.generated ? "Generated" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            onClick={() => {
              onSelect(structure);
              dialog.current?.close();
            }}
          >
            View data
          </Button>
        </dialog>
      )}
    </section>
  );
}
