import { useFeedback } from "../../app/Feedback";
import { Button } from "../../components/ui/button";
import { rowJson } from "../../../json/viewer";
import { recordDraft } from "../../app/workspace";
import { JsonInspector } from "../json/JsonInspector";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  QueryIdSchema,
  RequestIdSchema,
  SqlSchema,
  type SessionId,
  type SqlPage,
  type QueryCommand,
} from "../../../shared/protocol";
import type { Table } from "../../../shared/browse";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
type Owner = { sessionId: SessionId; generation: number };
export function QueryTab({
  sessionId,
  generation,
  tabId,
  sql,
  onChange,
  tables,
  onClose,
  onSaved,
  onTabState,
}: Owner & {
  tabId: QueryCommand["tabId"];
  sql: string;
  onChange: (sql: string) => void;
  tables: Table[];
  onClose: () => void;
  onSaved: () => void;
  onTabState: (dirty: boolean, close: () => void, busy: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [json, setJson] = useState<{ id: string; text: string; row?: boolean } | null>(null);
  const [jsonDirty, setJsonDirty] = useState(false);
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
    } else if (!reply.ok) {
      setMessage(reply.error.message);
      if (reply.error.code === "QUERY_SESSION_CLOSED") {
        setReady(false);
        setTransaction("unknown");
      }
    }
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
      } else if (!reply.ok) {
        setMessage(reply.error.message);
        if (reply.error.code === "QUERY_SESSION_CLOSED") {
          setReady(false);
          setTransaction("unknown");
        }
      }
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
  function requestClose() {
    if (busy) return;
    if (
      (sql.trim() || jsonDirty || transaction !== "idle") &&
      !window.confirm(
        "Close this query? Unsaved SQL and JSON will be discarded and any open transaction rolled back.",
      )
    )
      return;
    if (json) recordDraft(`json:${json.id}`, "json", "", null);
    onClose();
  }
  useEffect(() => {
    onTabState(!!sql.trim() || jsonDirty, requestClose, busy);
  });
  return (
    <div
      className={`query-tab ${json ? "has-json-panel" : ""}`}
      data-dirty={!!sql.trim() || jsonDirty}
    >
      {json && (
        <JsonInspector
          key={json.id}
          documentId={json.id}
          sourceText={json.text}
          readOnly={json.row}
          title={json.row ? "Row as JSON" : "JSON viewer"}
          onClose={() => setJson(null)}
          onDirtyChange={setJsonDirty}
        />
      )}
      <div className="query-toolbar">
        <Button
          className="query-run"
          disabled={!ready || busy}
          onClick={() => void run(editor.current?.selected() || editor.current?.text() || sql)}
        >
          Run SQL / selection
        </Button>
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
        <fieldset className="transaction-controls" aria-label="Transaction controls">
          <span>Transaction</span>
          {["BEGIN", "COMMIT", "ROLLBACK"].map((statement) => (
            <button key={statement} disabled={!ready || busy} onClick={() => void run(statement)}>
              {statement}
            </button>
          ))}
        </fieldset>
        <button disabled={busy || !page || page.done} onClick={() => setConfirmEnd(true)}>
          End unfinished result…
        </button>
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
                    if (reply.ok) {
                      setTransaction("idle");
                      setConfirmEnd(false);
                    }
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
      <SqlEditor value={sql} onChange={onChange} onReady={editorReady} tables={tables} />
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
                  if (reply.ok) {
                    onSaved();
                    toast("Query saved");
                  } else toast("Could not save query", { error: true });
                }
              });
          }}
        >
          Save query
        </button>
      </div>
      <output className="query-status" aria-live="polite">
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
                  <th aria-label="Row actions" />
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
                    <td>
                      <button
                        aria-label={`Inspect row ${index + 1} as JSON`}
                        onClick={() => {
                          if (
                            jsonDirty &&
                            !window.confirm(
                              "Discard unsaved JSON draft before inspecting another value?",
                            )
                          )
                            return;
                          if (json) recordDraft(`json:${json.id}`, "json", "", null);
                          setJson({
                            id: crypto.randomUUID(),
                            row: true,
                            text: rowJson(
                              row.map((text, column) => ({
                                name: page.fields[column]?.name ?? String(column),
                                typeOid: page.fields[column]?.typeOid ?? 25,
                                text,
                              })),
                            ),
                          });
                        }}
                      >
                        {index + 1}
                      </button>
                    </td>
                    {row.map((cell, column) => (
                      <td key={column}>
                        {cell === null ? (
                          <em>SQL NULL</em>
                        ) : [114, 3802].includes(page.fields[column]?.typeOid ?? 0) ? (
                          <button
                            onClick={() => {
                              if (
                                !jsonDirty ||
                                window.confirm(
                                  "Discard unsaved JSON draft before opening another value?",
                                )
                              ) {
                                if (json) recordDraft(`json:${json.id}`, "json", "", null);
                                setJson({ id: crypto.randomUUID(), text: cell });
                              }
                            }}
                          >
                            Inspect JSON
                          </button>
                        ) : (
                          cell
                        )}
                      </td>
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
