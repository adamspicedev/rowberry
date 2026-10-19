import { useEffect, useState } from "react";
import { RequestIdSchema } from "../../shared/protocol";
import { ConnectionList } from "../features/connections/ConnectionList";
import { Button } from "../components/ui/button";
export function App() {
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
          <span className="brand-mark">▦</span>
          <strong>dbapp</strong>
          <span className="badge">LOCAL</span>
        </header>
        <div className="sidebar-content">
          <ConnectionList />
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
            Overview
          </Button>
          <span className="connection-state">
            <i /> No connection
          </span>
        </nav>
        <section className="workspace" aria-label="Empty workspace">
          <div className="welcome">
            <div className="database-icon" aria-hidden="true">
              ▦
            </div>
            <h1>Your database workspace</h1>
            <p>Browse tables, write SQL, and inspect JSON in one place.</p>
            <div className="empty-card">
              <strong>No database connected</strong>
              <p>
                Save a connection from the sidebar. Database connectivity will follow in the next
                milestone.
              </p>
            </div>
          </div>
        </section>
        <div className="statusbar">
          <span>PostgreSQL workspace</span>
          <span>{status}</span>
        </div>
      </main>
    </div>
  );
}
