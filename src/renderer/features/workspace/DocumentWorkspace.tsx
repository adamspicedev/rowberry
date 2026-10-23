import { createPortal } from "react-dom";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { TableView } from "../table/TableView";
import { QueryTab } from "../query/QueryTab";
import { loadDrafts, saveDrafts } from "../query/query-state";
import {
  RequestIdSchema,
  TabIdSchema,
  type SessionId,
  type QueryCommand,
} from "../../../shared/protocol";
import type { Table } from "../../../shared/browse";
const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
type Owner = { sessionId: SessionId; generation: number };
type Document = { id: QueryCommand["tabId"]; sql: string; title: string; table?: Table };
export type WorkspaceHandle = {
  openTable: (table: Table) => void;
  openQuery: (sql: string) => void;
};
export function DocumentWorkspace({
  sessionId,
  generation,
  tabHost,
  onActivate,
  workspaceRef,
  onSelectedTable,
  connected,
}: Owner & {
  tabHost: HTMLDivElement | null;
  connected: boolean;
  onActivate: () => boolean;
  workspaceRef: Ref<WorkspaceHandle>;
  onSelectedTable: (id: Table["id"] | null) => void;
}) {
  const [tabs, setTabs] = useState<Document[]>(() => {
    const drafts = loadDrafts();
    return drafts.map((sql, index) => ({
      id: TabIdSchema.parse(crypto.randomUUID()),
      sql,
      title: `SQL ${index + 1}`,
    }));
  });
  const [active, setActive] = useState(tabs[0]?.id);
  const focusAfterClose = useRef(false);
  useEffect(() => {
    const element = active ? document.getElementById(`tab-${active}`) : null;
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focusAfterClose.current) {
      (element ?? tabHost?.querySelector<HTMLButtonElement>(".new-document"))?.focus();
      focusAfterClose.current = false;
    }
  }, [active, tabHost]);
  const currentTabs = useRef(tabs);
  const connectionLive = useRef(connected);
  useEffect(() => {
    connectionLive.current = connected;
  }, [connected]);
  const mounted = useRef(true);
  useEffect(() => {
    currentTabs.current = tabs;
  }, [tabs]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selectedTable = tabs.find((tab) => tab.id === active)?.table?.id ?? null;
  useEffect(() => {
    onSelectedTable(selectedTable);
  }, [onSelectedTable, selectedTable]);
  const [tables, setTables] = useState<Table[]>([]);
  const [saved, setSaved] = useState<{ id: string; name: string }[]>([]);
  const [offset, setOffset] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!saveDrafts(tabs.filter((tab) => !tab.table).map((tab) => tab.sql)))
      queueMicrotask(() =>
        setStorageError("Local draft storage is full. Save important SQL as a saved query."),
      );
  }, [tabs]);
  useEffect(() => {
    let live = true;
    void window.dbapp
      .request({ kind: "schema.list", sessionId, generation, requestId: requestId() })
      .then((reply) => {
        if (live && reply.ok && reply.kind === "schema.list") setTables(reply.data.tables);
      });
    return () => {
      live = false;
    };
  }, [sessionId, generation]);
  const refresh = useCallback(() => {
    void window.dbapp
      .request({ kind: "queries.saved.list", requestId: requestId(), offset })
      .then((reply) => {
        if (reply.ok && reply.kind === "queries.saved.list") {
          setSaved(reply.data.items);
          setNext(reply.data.nextOffset);
        }
      });
  }, [offset]);
  useEffect(refresh, [refresh]);
  const nextQuery = useRef(tabs.length + 1);
  const closeHandlers = useRef(new Map<string, () => void>());
  const [tabState, setTabState] = useState<Record<string, { dirty: boolean; busy: boolean }>>({});
  const markTabState = useCallback((id: string, dirty: boolean, busy: boolean) => {
    setTabState((current) =>
      current[id]?.dirty === dirty && current[id]?.busy === busy
        ? current
        : { ...current, [id]: { dirty, busy } },
    );
  }, []);
  const close = (id: string) => {
    const table = tabs.find((tab) => tab.id === id)?.table;
    if (table)
      void window.dbapp.request({
        kind: "rows.release",
        sessionId,
        generation,
        tableId: table.id,
        requestId: requestId(),
      });
    closeHandlers.current.delete(id);
    setTabState((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setStorageError("");
    setTabs((current) => current.filter((tab) => tab.id !== id));
    if (active === id) {
      focusAfterClose.current = true;
      const index = tabs.findIndex((tab) => tab.id === id);
      setActive((tabs[index + 1] ?? tabs[index - 1])?.id);
    }
  };
  const add = (sql = "", title?: string) => {
    if (
      !mounted.current ||
      !connectionLive.current ||
      currentTabs.current.length >= 16 ||
      !onActivate()
    )
      return;
    const id = TabIdSchema.parse(crypto.randomUUID());
    const label = title ?? `SQL ${nextQuery.current++}`;
    setTabs((current) =>
      current.length >= 16 ? current : [...current, { id, sql, title: label }],
    );
    setActive(id);
  };
  useImperativeHandle(workspaceRef, () => ({
    openQuery: (sql) => add(sql),
    openTable(table) {
      const existing = tabs.find((tab) => tab.table?.id === table.id);
      if (existing) {
        setActive(existing.id);
        return;
      }
      if (tabs.length >= 16) {
        setStorageError("Close a tab before opening another (16 tab limit).");
        return;
      }
      const id = TabIdSchema.parse(crypto.randomUUID());
      setTabs((current) => [...current, { id, table, sql: "", title: table.name }]);
      setActive(id);
    },
  }));
  return (
    <section
      className={`query-workspace ${selectedTable !== null ? "table-document" : ""}`}
      aria-label="Database workspace"
    >
      {tabHost &&
        createPortal(
          <>
            <div role="tablist" aria-label="Open tables and queries" className="document-tabs">
              {tabs.map((tab, index) => (
                <div className="document-tab" key={tab.id}>
                  <button
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-controls={`panel-${tab.id}`}
                    aria-selected={tab.id === active}
                    tabIndex={tab.id === active ? 0 : -1}
                    title={tab.table ? `${tab.table.schema}.${tab.table.name}` : tab.title}
                    onClick={() => {
                      if (onActivate()) setActive(tab.id);
                    }}
                    onKeyDown={(event) => {
                      const target =
                        event.key === "ArrowRight"
                          ? (index + 1) % tabs.length
                          : event.key === "ArrowLeft"
                            ? (index + tabs.length - 1) % tabs.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? tabs.length - 1
                                : -1;
                      if (target < 0 || !onActivate()) return;
                      event.preventDefault();
                      const next = tabs[target]!;
                      setActive(next.id);
                      document.getElementById(`tab-${next.id}`)?.focus();
                    }}
                  >
                    <span aria-hidden="true">{tab.table ? "▦" : "‹›"}</span> {tab.title}
                    {tabState[tab.id]?.dirty && <span aria-label="Unsaved changes"> •</span>}
                  </button>
                  <button
                    className="document-close"
                    aria-label={`Close ${tab.title}`}
                    disabled={tabState[tab.id]?.busy}
                    onClick={() => closeHandlers.current.get(tab.id)?.()}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              className="new-document"
              aria-label="New SQL tab"
              title="New SQL tab"
              disabled={!connected || tabs.length >= 16}
              onClick={() => add()}
            >
              +
            </button>
          </>,
          tabHost,
        )}
      <div className="query-toolbar">
        <label>
          Saved queries{" "}
          <select
            aria-label="Saved queries"
            disabled={!connected || tabs.length >= 16}
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (id)
                void window.dbapp
                  .request({ kind: "queries.saved.get", id, requestId: requestId() })
                  .then((reply) => {
                    if (reply.ok && reply.kind === "queries.saved.get")
                      add(reply.data.sql, reply.data.name);
                  });
            }}
          >
            <option value="">Open without running</option>
            {saved.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {offset > 0 && <button onClick={() => setOffset(offset - 20)}>Previous saved</button>}
        {next !== null && <button onClick={() => setOffset(next)}>More saved</button>}
      </div>
      {!connected && (
        <output>
          Connection lost. Your open tabs are retained; reconnect from the sidebar when ready.
        </output>
      )}
      {storageError && <p role="alert">{storageError}</p>}
      {!tabs.length && (
        <div className="empty-card">
          <strong>Open a table or start a query</strong>
          <p>Choose a table in the sidebar, or use + to open a SQL tab.</p>
        </div>
      )}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
        >
          {tab.table ? (
            <TableView
              table={tab.table}
              sessionId={sessionId}
              generation={generation}
              onTabState={(value, requestClose, busy) => {
                markTabState(tab.id, value, busy);
                closeHandlers.current.set(tab.id, requestClose);
              }}
              onClose={() => close(tab.id)}
            />
          ) : (
            <QueryTab
              sessionId={sessionId}
              generation={generation}
              tabId={tab.id}
              sql={tab.sql}
              tables={tables}
              onTabState={(value, requestClose, busy) => {
                markTabState(tab.id, value, busy);
                closeHandlers.current.set(tab.id, requestClose);
              }}
              onSaved={refresh}
              onChange={(sql) =>
                setTabs((current) =>
                  current.map((item) => (item.id === tab.id ? { ...item, sql } : item)),
                )
              }
              onClose={() => close(tab.id)}
            />
          )}
        </div>
      ))}
    </section>
  );
}
