import { CommandMenu } from "./CommandMenu";
import { applyTheme } from "./theme";
import { RecoveryControls } from "./recovery";
import { discardLiveJsonDrafts, loadWorkspace, updateWorkspace } from "./workspace";
import { DocumentWorkspace, type WorkspaceHandle } from "../features/workspace/DocumentWorkspace";
import mark from "../assets/rowberry-mark.svg";
import { useEffect, useRef, useState } from "react";
import { acceptSessionEvent, type SessionState } from "./session-state";
import { RequestIdSchema } from "../../shared/protocol";
import { ConnectionList } from "../features/connections/ConnectionList";
import { Button } from "../components/ui/button";
import type { Table } from "../../shared/browse";
import { SchemaSidebar } from "../features/schema/SchemaSidebar";
export function App() {
  const [managerVisible, setManagerVisible] = useState(true);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const connectionFlags = useRef({ dirty: false, busy: false });
  const [connectionDirty, setConnectionDirty] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  function markConnectionDirty(value: boolean) {
    connectionFlags.current.dirty = value;
    setConnectionDirty(value);
  }
  function markConnectionBusy(value: boolean) {
    connectionFlags.current.busy = value;
    setConnectionBusy(value);
  }
  const [connectionReset, setConnectionReset] = useState(0);
  function leaveManager() {
    if (connectionFlags.current.busy) return false;
    if (connectionFlags.current.dirty && !window.confirm("Discard unsaved connection changes?"))
      return false;
    markConnectionDirty(false);
    setConnectionReset((current) => current + 1);
    setManagerVisible(false);
    return true;
  }
  const [loaded, setLoaded] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table["id"] | null>(null);
  const workspace = useRef<WorkspaceHandle>(null);
  const [tabHost, setTabHost] = useState<HTMLDivElement | null>(null);
  const [{ session, workspaceSession }, setSessions] = useState<{
    session: SessionState | null;
    workspaceSession: SessionState | null;
  }>({ session: null, workspaceSession: null });
  useEffect(
    () =>
      window.dbapp.subscribe((event) =>
        setSessions((previous) => {
          const session = acceptSessionEvent(previous.session, event);
          if (session === previous.session) return previous;
          return {
            session,
            workspaceSession: session?.state === "connected" ? session : previous.workspaceSession,
          };
        }),
      ),
    [],
  );
  const [status, setStatus] = useState("Starting");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
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
    void loadWorkspace().then((state) => {
      setTheme(state.theme);
      setLoaded(true);
    });
    const protect = (event: BeforeUnloadEvent) => {
      if (
        document.querySelector(
          '[data-dirty="true"], [data-recovery-dirty="true"], [data-saving="true"], [data-connection-dirty="true"], [data-connection-saving="true"]',
        )
      ) {
        event.preventDefault();
        event.returnValue = "Unsaved drafts";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  if (!loaded) return <output>Loading local workspace…</output>;
  return (
    <div className="app" data-app-ready>
      <aside aria-label="Connections and schemas">
        <header>
          <img className="brand-mark" src={mark} alt="" />
          <strong className="brand-wordmark">rowberry</strong>
          <span className="badge">LOCAL</span>
        </header>
        <div className="sidebar-content">
          <Button variant="ghost" onClick={() => setManagerVisible(true)}>
            Connections
          </Button>
          <ConnectionList
            editorHost={editorHost}
            onDirty={markConnectionDirty}
            onBusy={markConnectionBusy}
            onShow={() => setManagerVisible(true)}
            onConnected={() => {
              leaveManager();
            }}
            resetKey={connectionReset}
            connecting={session?.state === "connecting"}
            activeId={session && session.state !== "disconnected" ? session.profileId : undefined}
          />
          {session?.state === "connected" && (
            <SchemaSidebar
              key={session.sessionId}
              sessionId={session.sessionId}
              generation={session.generation}
              selected={selectedTable}
              onSelect={(table) => {
                if (leaveManager()) workspace.current?.openTable(table);
              }}
            />
          )}
        </div>
        <footer>
          <label htmlFor="appearance">Appearance</label>
          <select
            id="appearance"
            value={theme}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "system" || value === "light" || value === "dark") {
                setTheme(value);
                updateWorkspace({ theme: value });
              }
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </footer>
      </aside>
      <main>
        <nav aria-label="Workspace tabs">
          <div className="document-tab-host" ref={setTabHost} />
        </nav>
        <div
          className="connection-manager-host"
          ref={setEditorHost}
          hidden={!managerVisible}
          data-connection-dirty={connectionDirty}
          data-connection-saving={connectionBusy}
        />
        {workspaceSession && (
          <div className="query-workspace-host" hidden={managerVisible}>
            <DocumentWorkspace
              key={`${workspaceSession.sessionId}:${workspaceSession.generation}`}
              sessionId={workspaceSession.sessionId}
              generation={workspaceSession.generation}
              tabHost={tabHost}
              workspaceRef={workspace}
              onSelectedTable={setSelectedTable}
              connected={
                session?.state === "connected" && session.sessionId === workspaceSession.sessionId
              }
              onActivate={leaveManager}
            />
          </div>
        )}
        {!workspaceSession && !managerVisible && (
          <section className="workspace" aria-label="Empty workspace">
            <div className="empty-card">
              <strong>No database connected</strong>
              <p>Choose a saved connection in the sidebar to open tables and queries.</p>
            </div>
          </section>
        )}
        <div className="workspace-utilities">
          <CommandMenu />
          <RecoveryControls />
        </div>
        <div className="statusbar">
          <span className="connection-state" data-state={session?.state}>
            <i /> {session?.state ?? "No connection"}
          </span>
          {session && session.state !== "disconnected" && (
            <Button
              variant="ghost"
              onClick={() => {
                if (document.querySelector('[data-saving="true"]')) return;
                if (
                  document.querySelector('[data-dirty="true"]') &&
                  !window.confirm("Discard unsaved drafts before disconnecting?")
                )
                  return;
                discardLiveJsonDrafts();
                void window.dbapp
                  .request({
                    kind: "sessions.close",
                    sessionId: session.sessionId,
                    requestId: RequestIdSchema.parse(crypto.randomUUID()),
                  })
                  .then((reply) => {
                    if (reply.ok)
                      setSessions((current) =>
                        current.workspaceSession?.sessionId === session.sessionId
                          ? { ...current, workspaceSession: null }
                          : current,
                      );
                  });
              }}
            >
              Disconnect
            </Button>
          )}

          <span>PostgreSQL workspace</span>
          <span>{status}</span>
        </div>
      </main>
    </div>
  );
}
