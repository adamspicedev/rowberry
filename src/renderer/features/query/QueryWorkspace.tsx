import { useCallback, useEffect, useRef, useState } from "react";
import {
  QueryIdSchema,
  RequestIdSchema,
  SqlSchema,
  TabIdSchema,
  type SessionId,
  type SqlPage,
  type QueryCommand,
} from "../../../shared/protocol";
import type { Table } from "../../../shared/browse";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { loadDrafts, saveDrafts } from "./query-state";
const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
type Owner = { sessionId: SessionId; generation: number };
export function QueryWorkspace({ sessionId, generation }: Owner) {
  const [tabs, setTabs] = useState(() => {
    const drafts = loadDrafts();
    return (drafts.length ? drafts : [""]).map((sql) => ({
      id: TabIdSchema.parse(crypto.randomUUID()),
      sql,
    }));
  });
  const [active, setActive] = useState(tabs[0]?.id);
  const [tables, setTables] = useState<Table[]>([]);
  const [saved, setSaved] = useState<{ id: string; name: string }[]>([]);
  const [offset, setOffset] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!saveDrafts(tabs.map((tab) => tab.sql)))
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
  const add = (sql = "") => {
    if (tabs.length >= 16) return;
    const id = TabIdSchema.parse(crypto.randomUUID());
    setTabs((current) => [...current, { id, sql }]);
    setActive(id);
  };
  return (
    <section className="query-workspace" aria-label="SQL workspace">
      <div className="query-toolbar">
        <button onClick={() => add()} disabled={tabs.length >= 16}>
          New SQL tab
        </button>
        <label>
          Saved queries{" "}
          <select
            aria-label="Saved queries"
            value=""
            onChange={(event) => {
              const id = event.target.value;
              if (id)
                void window.dbapp
                  .request({ kind: "queries.saved.get", id, requestId: requestId() })
                  .then((reply) => {
                    if (reply.ok && reply.kind === "queries.saved.get") add(reply.data.sql);
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
      {storageError && <p role="alert">{storageError}</p>}
      <div role="tablist" aria-label="SQL tabs">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => setActive(tab.id)}
          >
            SQL {index + 1}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} hidden={tab.id !== active}>
          <QueryTab
            sessionId={sessionId}
            generation={generation}
            tabId={tab.id}
            sql={tab.sql}
            tables={tables}
            onSaved={refresh}
            onChange={(sql) =>
              setTabs((current) =>
                current.map((item) => (item.id === tab.id ? { ...item, sql } : item)),
              )
            }
            onClose={() => {
              setTabs((current) => current.filter((item) => item.id !== tab.id));
              if (active === tab.id) setActive(tabs.find((item) => item.id !== tab.id)?.id);
            }}
          />
        </div>
      ))}
    </section>
  );
}
function QueryTab({
  sessionId,
  generation,
  tabId,
  sql,
  onChange,
  tables,
  onClose,
  onSaved,
}: Owner & {
  tabId: QueryCommand["tabId"];
  sql: string;
  onChange: (sql: string) => void;
  tables: Table[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<SqlPage | null>(null);
  const [queryId, setQueryId] = useState<SqlPage["queryId"] | null>(null);
  const [transaction, setTransaction] = useState("idle");
  const [message, setMessage] = useState("Opening dedicated session…");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [name, setName] = useState("");
  const live = useRef(true);
  const editor = useRef<SqlEditorHandle | null>(null);
  const editorReady = useCallback((handle: SqlEditorHandle | null) => {
    editor.current = handle;
  }, []);
  const owner = { sessionId, generation, tabId };
  useEffect(
    () =>
      window.dbapp.subscribe((event) => {
        if (
          event.kind === "queries.state" &&
          event.sessionId === sessionId &&
          event.generation === generation &&
          event.tabId === tabId &&
          event.queryId === queryId
        ) {
          setTransaction(event.transaction);
          if (event.error) setMessage(event.error);
          if (event.status === "unknown") setReady(false);
        }
      }),
    [sessionId, generation, tabId, queryId],
  );
  useEffect(() => {
    live.current = true;
    void window.dbapp
      .request({ kind: "queries.openTab", requestId: requestId(), sessionId, generation, tabId })
      .then((reply) => {
        if (!live.current) return;
        setReady(reply.ok);
        setMessage(reply.ok ? "Ready" : !reply.ok ? reply.error.message : "Unavailable");
      });
    return () => {
      live.current = false;
      void window.dbapp.request({
        kind: "queries.closeTab",
        requestId: requestId(),
        sessionId,
        generation,
        tabId,
      });
    };
  }, [sessionId, generation, tabId]);
  async function fetchPage(id: SqlPage["queryId"]) {
    const reply = await window.dbapp.request({
      kind: "queries.fetch",
      ...owner,
      queryId: id,
      pageSize: 200,
      requestId: requestId(),
    });
    if (!live.current) return;
    if (reply.ok && reply.kind === "queries.fetch") {
      setPage(reply.data);
      setTransaction(reply.data.transaction);
      setMessage(reply.data.error ?? reply.data.status);
      if (reply.data.status === "unknown") setReady(false);
    } else if (!reply.ok) setMessage(reply.error.message);
  }
  async function run(text: string) {
    if (busy) return;
    const valid = SqlSchema.safeParse(text);
    if (!valid.success) {
      setMessage("Enter SQL up to 1 MiB. Select one statement to run a portion of the editor.");
      return;
    }
    if (page && !page.done) {
      setConfirmEnd(true);
      return;
    }
    setBusy(true);
    setMessage("Running");
    setPage(null);
    try {
      const reply = await window.dbapp.request({
        kind: "queries.start",
        ...owner,
        sql: text,
        requestId: requestId(),
      });
      if (!live.current) return;
      if (reply.ok && reply.kind === "queries.start") {
        const id = QueryIdSchema.parse(reply.data.queryId);
        setQueryId(id);
        await fetchPage(id);
      } else if (!reply.ok) setMessage(reply.error.message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function closeResult() {
    if (!queryId) return;
    setBusy(true);
    const reply = await window.dbapp.request({
      kind: "queries.close",
      ...owner,
      queryId,
      requestId: requestId(),
    });
    if (live.current) {
      if (reply.ok) {
        setPage(null);
        setQueryId(null);
        setConfirmEnd(false);
        setMessage("Result ended. Run explicitly to execute more SQL.");
      } else setMessage(reply.error.message);
      setBusy(false);
    }
  }
  return (
    <div className="query-tab">
      <SqlEditor value={sql} onChange={onChange} onReady={editorReady} tables={tables} />
      <div className="query-toolbar">
        <button
          disabled={!ready || busy}
          onClick={() => void run(editor.current?.selected() || editor.current?.text() || sql)}
        >
          Run SQL / selection
        </button>
        <button
          disabled={!queryId || !busy}
          onClick={() => {
            if (queryId)
              void window.dbapp
                .request({ kind: "queries.cancel", ...owner, queryId, requestId: requestId() })
                .then((reply) => {
                  if (live.current && !reply.ok) {
                    setReady(false);
                    setMessage(
                      "Cancellation outcome unknown. Reopen the tab session before continuing. No SQL was retried.",
                    );
                  }
                });
          }}
        >
          Cancel query
        </button>
        {["BEGIN", "COMMIT", "ROLLBACK"].map((statement) => (
          <button key={statement} disabled={!ready || busy} onClick={() => void run(statement)}>
            {statement}
          </button>
        ))}
        <button disabled={busy || !page || page.done} onClick={() => setConfirmEnd(true)}>
          End unfinished result…
        </button>
        <button onClick={onClose}>Close SQL tab (roll back)</button>
        {!ready && (
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void window.dbapp
                .request({ kind: "queries.closeTab", ...owner, requestId: requestId() })
                .then(() =>
                  window.dbapp.request({
                    kind: "queries.openTab",
                    ...owner,
                    requestId: requestId(),
                  }),
                )
                .then((reply) => {
                  if (live.current) {
                    setReady(reply.ok);
                    setQueryId(null);
                    setPage(null);
                    setBusy(false);
                    setMessage(
                      reply.ok ? "Session reopened. Run SQL explicitly." : "Cannot reopen session.",
                    );
                  }
                });
            }}
          >
            Reopen session
          </button>
        )}
      </div>
      {confirmEnd && (
        <div role="alertdialog" aria-label="End unfinished result">
          <p>
            Ending an unfinished result can commit an implicit mutation. It does not undo changes.
            Close the SQL tab to disconnect and roll back its open transaction.
          </p>
          <button disabled={busy} onClick={() => void closeResult()}>
            End result and allow possible commit
          </button>
          <button onClick={() => setConfirmEnd(false)}>Keep result</button>
        </div>
      )}
      <div className="query-toolbar">
        <input
          aria-label="Saved query name"
          placeholder="Query name"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          disabled={!name.trim()}
          onClick={() => {
            const valid = SqlSchema.safeParse(sql);
            if (!valid.success) {
              setMessage("Saved queries must contain SQL of at most 1 MiB.");
              return;
            }
            void window.dbapp
              .request({
                kind: "queries.saved.save",
                requestId: requestId(),
                id: crypto.randomUUID(),
                name: name.trim(),
                sql,
              })
              .then((reply) => {
                if (live.current) {
                  setMessage(
                    reply.ok
                      ? "Query saved. It will never run automatically."
                      : reply.error.message,
                  );
                  if (reply.ok) onSaved();
                }
              });
          }}
        >
          Save query
        </button>
      </div>
      <output>
        {message} · Transaction: {transaction}
        {page
          ? ` · ${Math.round(page.durationMs)} ms elapsed · ${page.rowCount ?? page.rows.length} rows`
          : ""}
      </output>
      {page && (
        <>
          <div className="sql-results">
            <table aria-label="SQL results">
              <thead>
                <tr>
                  {page.fields.map((field, index) => (
                    <th key={index}>
                      {field.name}
                      <small> OID {field.typeOid}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, column) => (
                      <td key={column}>{cell === null ? <em>NULL</em> : cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={busy || page.done}
            onClick={() => {
              if (queryId) {
                setBusy(true);
                void fetchPage(queryId).finally(() => {
                  if (live.current) setBusy(false);
                });
              }
            }}
          >
            Next result page
          </button>
          <span> {page.rows.length} rows on this page · read only</span>
        </>
      )}
    </div>
  );
}
