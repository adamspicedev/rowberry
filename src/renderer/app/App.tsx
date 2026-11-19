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
  const [sidebarWidth, setSidebarWidth] = useState<number>();
  const [sidebar, setSidebar] = useState<HTMLElement | null>(null);
  const [sidebarRange, setSidebarRange] = useState({ width: 248, max: 248 });
  useEffect(() => {
    if (!sidebar) return;
    const measure = () =>
      setSidebarRange({
        width: Math.round(sidebar.getBoundingClientRect().width),
        max: Math.max(200, Math.round(window.innerWidth * 0.65)),
      });
    const observer = new ResizeObserver(measure);
    observer.observe(sidebar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [sidebar]);
  const dragOffset = useRef(0);
  function resizeSidebar(width: number) {
    const nextWidth = Math.round(Math.max(200, Math.min(width, window.innerWidth * 0.65)));
    setSidebarWidth(nextWidth);
    updateWorkspace({ sidebarWidth: nextWidth });
  }
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
      setSidebarWidth(state.sidebarWidth);
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
      <aside
        ref={setSidebar}
        id="table-list-sidebar"
        aria-label="Connections and schemas"
        style={{ width: sidebarWidth }}
      >
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
            connecting={
              session?.state === "connecting" || session?.state === "awaiting-credentials"
            }
            awaitingCredentials={session?.state === "awaiting-credentials"}
            activeId={session && session.state !== "disconnected" ? session.profileId : undefined}
          />
          {session?.state === "connected" && (
            <SchemaSidebar
              key={session.sessionId}
              sessionId={session.sessionId}
              generation={session.generation}
              onQuery={(sql) => workspace.current?.openQuery(sql)}
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
        <div
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Interactive window splitter.
          role="separator"
          className="sidebar-resizer"
          tabIndex={0}
          aria-label="Resize table list"
          aria-controls="table-list-sidebar"
          aria-orientation="vertical"
          aria-valuemin={200}
          aria-valuemax={sidebarRange.max}
          aria-valuenow={sidebarRange.width}
          title="Drag to resize the table list"
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary) return;
            dragOffset.current =
              e.clientX - e.currentTarget.parentElement!.getBoundingClientRect().width;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              resizeSidebar(e.clientX - dragOffset.current);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              resizeSidebar(e.clientX - dragOffset.current);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            resizeSidebar(
              e.currentTarget.parentElement!.getBoundingClientRect().width +
                (e.key === "ArrowRight" ? 20 : -20),
            );
          }}
        />
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
          <output className="connection-state" data-state={session?.state}>
            <i />{" "}
            {session?.state === "awaiting-credentials"
              ? "Waiting for Keychain access…"
              : (session?.state ?? "No connection")}
          </output>
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
