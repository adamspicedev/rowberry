import { QueryWorkspace } from "../features/query/QueryWorkspace";
import mark from "../assets/rowberry-mark.svg";
import { useEffect, useState } from "react";
import { acceptSessionEvent, type SessionState } from "./session-state";
import { RequestIdSchema } from "../../shared/protocol";
import { ConnectionList } from "../features/connections/ConnectionList";
import { Button } from "../components/ui/button";
import { SchemaSidebar } from "../features/schema/SchemaSidebar";
import { TableView } from "../features/table/TableView";
import type { Table } from "../../shared/browse";
export function App() {
  const [sqlOpened, setSqlOpened] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [selected, setSelected] = useState<{ sessionId: string; table: Table } | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  useEffect(
    () =>
      window.dbapp.subscribe((event) =>
        setSession((current) => acceptSessionEvent(current, event)),
      ),
    [],
  );
  const table = selected?.sessionId === session?.sessionId ? (selected?.table ?? null) : null;
  const [status, setStatus] = useState("Starting");
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    void window.dbapp
      .request({ kind: "app.info", requestId: RequestIdSchema.parse(crypto.randomUUID()) })
      .then((reply) =>
        setStatus(
          reply.ok && reply.kind === "app.info"
            ? `v${reply.data.version}`
            : !reply.ok
              ? reply.error.message
              : "Ready",
        ),
      );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <div className="app" data-app-ready>
      <aside aria-label="Connections and schemas">
        <header>
          <img className="brand-mark" src={mark} alt="" />
          <strong className="brand-wordmark">rowberry</strong>
          <span className="badge">LOCAL</span>
        </header>
        <div className="sidebar-content">
          <ConnectionList />
          {session?.state === "connected" && (
            <SchemaSidebar
              key={session.sessionId}
              sessionId={session.sessionId}
              generation={session.generation}
              selected={table?.id ?? null}
              onSelect={(table) => {
                if (document.querySelector('[data-saving="true"]')) return;
                if (
                  document.querySelector('[data-dirty="true"]') &&
                  !window.confirm("Discard unsaved table or JSON drafts before changing table?")
                )
                  return;
                setShowSql(false);
                setSelected({ sessionId: session.sessionId, table });
              }}
            />
          )}
        </div>
        <footer>
          <label htmlFor="appearance">Appearance</label>
          <select id="appearance" value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </footer>
      </aside>
      <main>
        <nav aria-label="Workspace tabs">
          <Button variant="ghost" className="active-tab" aria-current="page">
            {session?.state === "connected" && table ? table.name : "Overview"}
          </Button>
          {session?.state === "connected" && (
            <Button
              variant="ghost"
              onClick={() => {
                setSqlOpened(true);
                setShowSql((current) => !current);
              }}
            >
              {showSql ? "Table workspace" : "SQL workspace"}
            </Button>
          )}
          <span className="connection-state">
            <i /> {session?.state ?? "No connection"}
          </span>
          {session && session.state !== "disconnected" && (
            <Button
              variant="ghost"
              onClick={() =>
                void window.dbapp.request({
                  kind: "sessions.close",
                  sessionId: session.sessionId,
                  requestId: RequestIdSchema.parse(crypto.randomUUID()),
                })
              }
            >
              Disconnect
            </Button>
          )}
        </nav>
        {sqlOpened && session?.state === "connected" && (
          <div hidden={!showSql}>
            <QueryWorkspace
              key={session.sessionId}
              sessionId={session.sessionId}
              generation={session.generation}
            />
          </div>
        )}
        <div className="table-workspace-host" hidden={showSql}>
          {session && table ? (
            <TableView
              key={session.sessionId + table.id}
              table={table}
              sessionId={session.sessionId}
              generation={session.generation}
            />
          ) : (
            <section className="workspace" aria-label="Empty workspace">
              <div className="welcome">
                <div className="database-icon" aria-hidden="true">
                  <img src={mark} alt="" />
                </div>
                <h1>Your database workspace</h1>
                <p>Your databases. In a good place.</p>
                <div className="empty-card">
                  <strong>
                    {session?.state === "connected"
                      ? "Database connected"
                      : "No database connected"}
                  </strong>
                  <p>Select Connect in the sidebar to open a PostgreSQL session.</p>
                </div>
              </div>
            </section>
          )}
        </div>
        <div className="statusbar">
          <span>PostgreSQL workspace</span>
          <span>{status}</span>
        </div>
      </main>
    </div>
  );
}
