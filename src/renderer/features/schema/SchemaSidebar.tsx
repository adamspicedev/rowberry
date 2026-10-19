import { useEffect, useState } from "react";
import { RequestIdSchema, type SessionId } from "../../../shared/protocol";
import type { Table } from "../../../shared/browse";
import { Button } from "../../components/ui/button";
export function SchemaSidebar({
  sessionId,
  generation,
  selected,
  onSelect,
}: {
  sessionId: SessionId;
  generation: number;
  selected: string | null;
  onSelect: (table: Table) => void;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("Loading schemas…");
  const [reload, setReload] = useState(0);
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
        } else setState("Could not load schemas. Check the connection, then refresh.");
      });
    return () => {
      active = false;
    };
  }, [sessionId, generation, reload]);
  const visible = tables.filter((t) =>
    `${t.schema}.${t.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="schema-sidebar" aria-label="Database schemas">
      <div className="schema-heading">
        <strong>Tables</strong>
        <Button
          variant="ghost"
          onClick={() => {
            setState("Loading schemas…");
            setTables([]);
            setReload((n) => n + 1);
          }}
          aria-label="Refresh schemas"
        >
          ↻
        </Button>
      </div>
      <input
        aria-label="Search schemas and tables"
        placeholder="Search tables…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {state && <output>{state}</output>}
      {!state && !visible.length && <p>No matching tables.</p>}
      <ul>
        {visible.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={selected === t.id ? "selected" : ""}
              aria-pressed={selected === t.id}
              onClick={() => onSelect(t)}
            >
              <span>{t.name}</span>
              <small>
                {t.schema} · {t.kind}
                {!t.key.length ? " · read-only" : ""}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
