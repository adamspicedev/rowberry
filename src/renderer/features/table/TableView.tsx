/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtual rows and columns use ARIA grid semantics with absolute positions. */
import { JsonInspector, type ValidatedJsonDraft, type JsonSaveTarget } from "../json/JsonInspector";
import { useState, useRef, useEffect } from "react";
import { RequestIdSchema, type SessionId } from "../../../shared/protocol";
import {
  FetchSchema,
  FilterSchema,
  type SaveInput,
  type RowPage,
  type Table,
  type FetchInput,
} from "../../../shared/browse";
import { Button } from "../../components/ui/button";
import { useTablePage } from "./table-state";
const WIDTH = 210,
  HEIGHT = 34;
export function TableView({
  table: initialTable,
  sessionId,
  generation,
}: {
  table: Table;
  sessionId: SessionId;
  generation: number;
}) {
  const [input, setInput] = useState<FetchInput>({ tableId: initialTable.id });
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [reload, setReload] = useState(0);
  const state = useTablePage(sessionId, generation, input, reload);
  const [committedPage, setCommittedPage] = useState<RowPage | null>(null);
  const page = committedPage ?? (state.kind === "ready" ? state.page : null);
  const table = page?.table ?? initialTable;
  const [drafts, setDrafts] = useState<SaveInput["changes"]>([]);
  const [editor, setEditor] = useState<{
    target: string;
    column: string;
    original: string | null;
    text: string;
    sqlNull: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<SaveInput["changes"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [compare, setCompare] = useState<RowPage | null>(null);
  const [jsonSaveDraft, setJsonSaveDraft] = useState<ValidatedJsonDraft | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  function discardAllowed() {
    if (saving || preview) return false;
    if (
      (drafts.length || editor || jsonDirty) &&
      !window.confirm("Discard unsaved table and JSON drafts?")
    )
      return false;
    setDrafts([]);
    setEditor(null);
    setPreview(null);
    setJsonDirty(false);
    setJsonSaveDraft(null);
    setCompare(null);
    return true;
  }
  function edit(rowIndex: number, columnIndex: number) {
    if (saving || preview || blocked || !page) return;
    const row = page.rows[rowIndex],
      column = table.columns[columnIndex],
      cell = row?.cells[columnIndex];
    if (!row?.target || !column || cell?.kind !== "value" || !cell.editable) return;
    const pending = drafts.find((draft) => draft.target === row.target);
    const text =
      pending && Object.hasOwn(pending.values, column.name)
        ? pending.values[column.name]
        : cell.text;
    setEditor({
      target: row.target,
      column: column.name,
      original: cell.text,
      text: text ?? "",
      sqlNull: text === null,
    });
  }
  async function save() {
    if (!preview || saving || blocked || !page) return;
    const changes = preview;
    setSaving(true);
    setSaveStatus("Saving…");
    const reply = await window.dbapp.request({
      kind: "rows.save",
      sessionId,
      generation,
      requestId: RequestIdSchema.parse(crypto.randomUUID()),
      changes,
    });
    if (!alive.current) return;
    setSaving(false);
    setPreview(null);
    if (!reply.ok || reply.kind !== "rows.save") {
      setBlocked(true);
      setSaveStatus(
        "Save acknowledgement unavailable. It may have committed. Preserve drafts; explicitly refresh or reconnect before continuing. Do not retry.",
      );
      return;
    }
    const result = reply.data;
    if (result.kind !== "committed") {
      setSaveStatus(result.message);
      if (result.kind === "unknown") setBlocked(true);
      return;
    }
    // Never accept an incomplete mapping as a new baseline for preserved drafts.
    if (
      changes.some(
        (change) =>
          result.rows.filter((item) => item.previousTarget === change.target).length !== 1,
      )
    ) {
      setBlocked(true);
      setSaveStatus(
        "Committed, but refreshed row mapping is incomplete. Preserve drafts and explicitly refresh before continuing.",
      );
      return;
    }
    const next = {
      ...page,
      table: result.table,
      rows: page.rows.map(
        (row) => result.rows.find((item) => item.previousTarget === row.target)?.row ?? row,
      ),
    };
    setCommittedPage(next);
    setDrafts([]);
    setEditor(null);
    setSaveStatus("Changes committed");
    setCompare(null);
    if (jsonSaveDraft) {
      const saved = result.rows.find(
        (item) => item.previousTarget === jsonSaveDraft.saveTarget.target,
      )?.row;
      const index = result.table.columns.findIndex(
        (column) => column.name === jsonSaveDraft.saveTarget.column,
      );
      const cell = saved?.cells[index];
      if (saved?.target && cell?.kind === "value" && cell.text !== null) {
        setInspected(cell.text);
        setJsonTarget({ ...jsonSaveDraft.saveTarget, target: saved.target });
        setJsonId(crypto.randomUUID());
        setJsonDirty(false);
        setJsonSaveDraft(null);
      } else {
        clearInspection();
        setJsonSaveDraft(null);
        setJsonDirty(false);
      }
    }
  }
  async function compareCurrent() {
    if (saving) return;
    const reply = await window.dbapp.request({
      kind: "rows.fetch",
      sessionId,
      generation,
      requestId: RequestIdSchema.parse(crypto.randomUUID()),
      ...FetchSchema.parse(input),
    });
    if (!alive.current) return;
    if (reply.ok && reply.kind === "rows.fetch") {
      setCompare(reply.data);
      setBlocked(true);
    } else
      setSaveStatus(
        "Current rows unavailable. Drafts and original targets retained; reconnect explicitly.",
      );
  }
  const [filterColumn, setFilterColumn] = useState(table.columns[0]?.name ?? "");
  const [operator, setOperator] = useState("eq");
  const [value, setValue] = useState("");
  const [scroll, setScroll] = useState({ top: 0, left: 0, width: 1000, height: 500 });
  const [selection, setSelection] = useState({ row: 0, col: 0 });
  const [jsonTarget, setJsonTarget] = useState<JsonSaveTarget | undefined>();
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonId, setJsonId] = useState(crypto.randomUUID());
  const [inspected, setInspected] = useState<string | null>(null);
  const [inspectStatus, setInspectStatus] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const inspectionVersion = useRef(0);
  useEffect(
    () => () => {
      inspectionVersion.current++;
    },
    [],
  );
  function clearInspection() {
    inspectionVersion.current++;
    setInspected(null);
    setJsonSaveDraft(null);
    setJsonDirty(false);
    setInspectStatus("");
  }
  const firstRow = Math.max(0, Math.floor(scroll.top / HEIGHT) - 3),
    lastRow = Math.ceil((scroll.top + scroll.height) / HEIGHT) + 3;
  const firstColumn = Math.max(0, Math.floor(scroll.left / WIDTH) - 1),
    lastColumn = Math.ceil((scroll.left + scroll.width) / WIDTH) + 1;
  function resetViewport() {
    setScroll((current) => ({ ...current, top: 0, left: 0 }));
    setSelection({ row: 0, col: 0 });
    grid.current?.scrollTo({ top: 0, left: 0 });
  }
  function reset(next: FetchInput) {
    if (!discardAllowed()) return false;
    setBlocked(false);
    setCommittedPage(null);
    setInput(next);
    setHistory([]);
    resetViewport();
    clearInspection();
    return true;
  }
  async function inspect(row: number, col: number) {
    if (jsonDirty && !window.confirm("Discard unsaved JSON draft before inspecting another value?"))
      return;
    const version = ++inspectionVersion.current;
    if (!page || saving || preview) return;
    const record = page.rows[row],
      cell = record?.cells[col],
      column = table.columns[col];
    if (!cell || !column || ![114, 3802].includes(cell.typeOid)) return;
    setInspected(null);
    setJsonId(crypto.randomUUID());
    setJsonTarget(
      record?.target && cell.editable
        ? { target: record.target, column: column.name, sessionId, generation }
        : undefined,
    );
    if (cell.kind === "value") {
      setInspected(cell.text);
      setInspectStatus(cell.text === null ? "SQL NULL" : "Raw JSON · read-only inspection");
      return;
    }
    if (!record?.target) {
      setInspectStatus(
        "Oversized JSON has no stable row identity and cannot be fetched separately.",
      );
      return;
    }
    setInspectStatus("Loading full JSON…");
    const reply = await window.dbapp.request({
      kind: "rows.value",
      sessionId,
      generation,
      requestId: RequestIdSchema.parse(crypto.randomUUID()),
      target: record.target,
      column: column.name,
    });
    if (version !== inspectionVersion.current) return;
    if (reply.ok && reply.kind === "rows.value") {
      setJsonTarget(
        reply.data.editable && record.target
          ? { target: record.target, column: column.name, sessionId, generation }
          : undefined,
      );
      setInspected(reply.data.text);
      setInspectStatus("Raw JSON · read-only inspection");
    } else
      setInspectStatus(
        "Full JSON unavailable, changed, or exceeds the 32 MiB limit. No partial document was opened.",
      );
  }
  return (
    <section
      className="table-workspace"
      aria-label={`Table ${table.name}`}
      data-dirty={!!(drafts.length || editor || jsonDirty)}
      data-saving={saving}
    >
      <div className="table-toolbar">
        <strong>
          {table.schema}.{table.name}
        </strong>
        <span>
          {table.editable ? "Stable row identity" : "Read-only"}
          {table.rls ? " · RLS" : ""}
        </span>
        <Button
          variant="default"
          onClick={() => {
            if (reset({ ...input, cursor: null })) setReload((n) => n + 1);
          }}
        >
          Refresh
        </Button>
      </div>
      <div className="table-toolbar">
        <Button
          disabled={!drafts.length || saving || !!editor || jsonDirty}
          onClick={() => setPreview(drafts)}
        >
          Preview changes
        </Button>
        <Button
          disabled={saving || !(drafts.length || editor || jsonDirty)}
          onClick={() => {
            if (discardAllowed()) clearInspection();
          }}
        >
          Discard table drafts
        </Button>
        <output>{saveStatus}</output>
        {saveStatus && (
          <Button disabled={saving} onClick={() => void compareCurrent()}>
            Compare current database rows
          </Button>
        )}
      </div>
      {editor && (
        <section aria-label="Edit selected cell">
          <strong>{editor.column}</strong>
          <textarea
            aria-label="Cell draft"
            disabled={saving}
            value={editor.text}
            onChange={(event) => setEditor({ ...editor, text: event.target.value })}
          />
          <label>
            <input
              type="checkbox"
              aria-label="SQL NULL"
              checked={editor.sqlNull}
              onChange={(event) => setEditor({ ...editor, sqlNull: event.target.checked })}
            />
            SQL NULL
          </label>
          <Button
            onClick={() => {
              const value = editor.sqlNull ? null : editor.text;
              setDrafts((current) => {
                const next = current.map((change) => ({ ...change, values: { ...change.values } }));
                let change = next.find((item) => item.target === editor.target);
                if (!change) {
                  change = { target: editor.target, values: {} };
                  next.push(change);
                }
                if (value === editor.original) delete change.values[editor.column];
                else change.values[editor.column] = value;
                return next.filter((item) => Object.keys(item.values).length);
              });
              setEditor(null);
            }}
          >
            Stage cell
          </Button>
          <Button onClick={() => setEditor(null)}>Cancel cell edit</Button>
        </section>
      )}
      {preview && (
        <section
          className="save-preview"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm database changes"
        >
          <p>Review all original and pending values. This batch commits atomically.</p>
          {preview.map((change) => (
            <div key={change.target}>
              {Object.entries(change.values).map(([name, text]) => {
                const index = table.columns.findIndex((column) => column.name === name);
                const original = page?.rows.find((row) => row.target === change.target)?.cells[
                  index
                ];
                return (
                  <div key={name}>
                    <strong>{name}</strong>
                    <pre aria-label={`Original ${name}`}>
                      {original?.kind === "value"
                        ? original.text === null
                          ? "SQL NULL"
                          : original.text
                        : (jsonSaveDraft?.originalSource ?? "Large original value")}
                    </pre>
                    <pre aria-label={`Pending ${name}`}>{text === null ? "SQL NULL" : text}</pre>
                  </div>
                );
              })}
            </div>
          ))}
          <Button disabled={saving || blocked} onClick={() => void save()}>
            Confirm save
          </Button>
          <Button disabled={saving} onClick={() => setPreview(null)}>
            Cancel preview
          </Button>
        </section>
      )}
      {compare && (
        <section aria-label="Compare database with preserved drafts">
          <strong>Preserved drafts</strong>
          <pre>
            {JSON.stringify(
              drafts.length
                ? drafts
                : jsonSaveDraft
                  ? [{ column: jsonSaveDraft.saveTarget.column, text: jsonSaveDraft.text }]
                  : [],
              null,
              2,
            )}
          </pre>
          <strong>Current database values</strong>
          <p>
            Current database page; drafts keep their original concurrency targets. Refresh requires
            discarding drafts.
          </p>
          <pre>
            {JSON.stringify(
              compare.rows.map((row) =>
                row.cells.map((cell) => (cell.kind === "value" ? cell.text : "Large value")),
              ),
              null,
              2,
            )}
          </pre>
          <Button
            onClick={() => {
              if (reset({ ...input, cursor: null })) setReload((n) => n + 1);
            }}
          >
            Discard drafts and reload
          </Button>
          <Button onClick={() => setCompare(null)}>Keep drafts</Button>
        </section>
      )}
      <form
        className="filter-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const filter = FilterSchema.safeParse({ column: filterColumn, operator, value });
          if (filter.success) reset({ ...input, cursor: null, filter: [filter.data] });
        }}
      >
        <select
          aria-label="Filter column"
          value={filterColumn}
          onChange={(e) => setFilterColumn(e.target.value)}
        >
          {table.columns.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          aria-label="Filter operator"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
        >
          <option value="eq">equals</option>
          <option value="ne">not equal</option>
          <option value="contains">contains</option>
          <option value="gt">greater than</option>
          <option value="lt">less than</option>
          <option value="isNull">is NULL</option>
          <option value="isNotNull">is not NULL</option>
        </select>
        <input
          aria-label="Filter value"
          value={value}
          disabled={operator === "isNull" || operator === "isNotNull"}
          onChange={(e) => setValue(e.target.value)}
          maxLength={4096}
        />
        <Button variant="default" type="submit">
          Apply filter
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => reset({ ...input, cursor: null, filter: [] })}
        >
          Clear
        </Button>
      </form>
      {!table.key.length && (
        <p className="table-note">
          No suitable unique key. Rows are read-only; pages can shift when data changes.
        </p>
      )}
      {!page && state.kind === "loading" ? (
        <output className="table-note">Loading rows…</output>
      ) : !page && state.kind === "error" ? (
        <p role="alert" className="table-note">
          {state.message}
        </p>
      ) : page ? (
        <>
          <span id="grid-keyboard-help" className="sr-only">
            Use arrow keys to select a cell. Press Enter to inspect JSON. Use column buttons to
            sort.
          </span>
          <div
            className="grid-scroller"
            role="grid"
            aria-label="Table rows"
            aria-describedby="grid-keyboard-help"
            aria-activedescendant={
              selection.row >= firstRow &&
              selection.row < lastRow &&
              selection.col >= firstColumn &&
              selection.col < lastColumn &&
              page.rows.length
                ? `table-cell-${selection.row}-${selection.col}`
                : undefined
            }
            aria-rowcount={page.rows.length + 1}
            aria-colcount={table.columns.length}
            tabIndex={0}
            ref={grid}
            onScroll={(e) => {
              const el = e.currentTarget;
              setScroll({
                top: el.scrollTop,
                left: el.scrollLeft,
                width: el.clientWidth,
                height: el.clientHeight,
              });
            }}
            onKeyDown={(e) => {
              if (
                !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key) ||
                e.target !== e.currentTarget
              )
                return;
              e.preventDefault();
              if (e.key === "Enter") {
                void inspect(selection.row, selection.col);
                return;
              }
              const next = {
                row: Math.max(
                  0,
                  Math.min(
                    page.rows.length - 1,
                    selection.row + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
                  ),
                ),
                col: Math.max(
                  0,
                  Math.min(
                    table.columns.length - 1,
                    selection.col + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0),
                  ),
                ),
              };
              setSelection(next);
              grid.current?.scrollTo({
                top: Math.max(0, (next.row - 2) * HEIGHT),
                left: Math.max(0, (next.col - 2) * WIDTH),
              });
            }}
          >
            <div
              className="grid-header"
              role="row"
              aria-rowindex={1}
              style={{ width: table.columns.length * WIDTH }}
            >
              {table.columns.slice(firstColumn, lastColumn).map((c, i) => (
                <div
                  role="columnheader"
                  aria-colindex={firstColumn + i + 1}
                  key={c.name}
                  style={{ position: "absolute", left: (firstColumn + i) * WIDTH, width: WIDTH }}
                >
                  <button
                    type="button"
                    aria-label={`Sort by ${c.name}`}
                    onClick={() =>
                      reset({
                        ...input,
                        cursor: null,
                        sort: [
                          {
                            column: c.name,
                            direction:
                              input.sort?.[0]?.column === c.name &&
                              input.sort[0].direction === "asc"
                                ? "desc"
                                : "asc",
                          },
                        ],
                      })
                    }
                  >
                    {c.name}{" "}
                    {input.sort?.[0]?.column === c.name
                      ? input.sort[0].direction === "asc"
                        ? "↑"
                        : "↓"
                      : ""}
                    <small>
                      {c.typeName}
                      {c.generated ? " · generated" : c.identity ? " · identity" : ""}
                    </small>
                  </button>
                </div>
              ))}
            </div>
            <div
              style={{
                height: page.rows.length * HEIGHT,
                width: table.columns.length * WIDTH,
                position: "relative",
              }}
            >
              {page.rows.slice(firstRow, lastRow).map((row, i) => (
                <div
                  role="row"
                  aria-rowindex={firstRow + i + 2}
                  key={firstRow + i}
                  className="grid-row"
                  style={{
                    position: "absolute",
                    top: (firstRow + i) * HEIGHT,
                    height: HEIGHT,
                    width: table.columns.length * WIDTH,
                  }}
                >
                  {row.cells.slice(firstColumn, lastColumn).map((cell, j) => (
                    <div
                      tabIndex={-1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void inspect(firstRow + i, firstColumn + j);
                      }}
                      id={`table-cell-${firstRow + i}-${firstColumn + j}`}
                      role="gridcell"
                      aria-colindex={firstColumn + j + 1}
                      aria-selected={
                        selection.row === firstRow + i && selection.col === firstColumn + j
                      }
                      key={firstColumn + j}
                      className={`grid-cell ${cell.text === null ? "muted-cell" : ""}`}
                      style={{
                        position: "absolute",
                        left: (firstColumn + j) * WIDTH,
                        width: WIDTH,
                        height: HEIGHT,
                      }}
                      onClick={() => {
                        setSelection({ row: firstRow + i, col: firstColumn + j });
                        grid.current?.focus();
                      }}
                      onDoubleClick={() =>
                        [114, 3802].includes(cell.typeOid)
                          ? void inspect(firstRow + i, firstColumn + j)
                          : edit(firstRow + i, firstColumn + j)
                      }
                      title={
                        cell.kind === "oversized"
                          ? `${cell.bytes} bytes · omitted; open JSON to fetch full value`
                          : cell.text === null
                            ? "SQL NULL"
                            : cell.text.length > 512
                              ? cell.text.slice(0, 512) + "…"
                              : cell.text
                      }
                    >
                      {cell.kind === "oversized"
                        ? `Large value · ${cell.bytes.toLocaleString()} B`
                        : cell.text === null
                          ? "NULL"
                          : cell.text === ""
                            ? "(empty)"
                            : cell.text.slice(0, 256)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {!page.rows.length && <output className="table-note">No rows found.</output>}
          <div className="table-pagination">
            <span>
              {page.rows.length} rows · page {history.length + 1}
            </span>
            <label>
              Rows per page{" "}
              <select
                aria-label="Rows per page"
                value={input.pageSize ?? 200}
                onChange={(e) =>
                  reset({ ...input, cursor: null, pageSize: Number(e.target.value) })
                }
              >
                <option>200</option>
                <option>500</option>
                <option>1000</option>
              </select>
            </label>
            <Button
              variant="default"
              disabled={!history.length}
              onClick={() => {
                if (!discardAllowed()) return;
                setCommittedPage(null);
                const cursor = history.at(-1) ?? null;
                setHistory((h) => h.slice(0, -1));
                setInput({ ...input, cursor });
                resetViewport();
                clearInspection();
              }}
            >
              Previous
            </Button>
            <Button
              variant="default"
              disabled={!page.nextCursor}
              onClick={() => {
                if (!discardAllowed()) return;
                setCommittedPage(null);
                setHistory((h) => [...h, input.cursor ?? null]);
                setInput({ ...input, cursor: page.nextCursor });
                clearInspection();
                resetViewport();
              }}
            >
              Next
            </Button>
            <Button
              disabled={saving || blocked}
              variant="ghost"
              onClick={() => edit(selection.row, selection.col)}
            >
              Edit selected cell
            </Button>
            <Button variant="ghost" onClick={() => void inspect(selection.row, selection.col)}>
              Inspect selected JSON
            </Button>
          </div>
        </>
      ) : null}
      {inspected !== null ? (
        <JsonInspector
          key={jsonId}
          documentId={jsonId}
          sourceText={inspected}
          saveTarget={jsonTarget}
          onClose={clearInspection}
          onDirtyChange={setJsonDirty}
          saving={saving || !!preview}
          saveBlocked={blocked || !!drafts.length || !!editor}
          onSaveDraft={(draft) => {
            setJsonSaveDraft(draft);
            setPreview([
              {
                target: draft.saveTarget.target,
                values: { [draft.saveTarget.column]: draft.text },
              },
            ]);
          }}
        />
      ) : (
        inspectStatus && (
          <section className="raw-inspector" aria-label="JSON inspection">
            <strong>{inspectStatus}</strong>
            <Button variant="ghost" onClick={clearInspection}>
              Close inspection
            </Button>
          </section>
        )
      )}
    </section>
  );
}
