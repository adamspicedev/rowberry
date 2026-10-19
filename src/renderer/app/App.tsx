import { useEffect, useState } from "react";
import { RequestIdSchema } from "../../shared/protocol";
import { Button } from "../components/ui/button";
export function App() {
  const [status, setStatus] = useState("Starting");
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    void window.dbapp
      .request({ kind: "app.info", requestId: RequestIdSchema.parse(crypto.randomUUID()) })
      .then((reply) => setStatus(reply.ok ? `v${reply.data.version}` : reply.error.message));
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
          <label htmlFor="schema-search" className="sr-only">
            Search connections and schemas
          </label>
          <input id="schema-search" placeholder="Search connections…" type="search" />
          <div className="section-label">
            CONNECTIONS <span>0</span>
          </div>
          <p className="sidebar-empty">No saved connections</p>
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
              <p>Connection setup will be available in the next milestone.</p>
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
