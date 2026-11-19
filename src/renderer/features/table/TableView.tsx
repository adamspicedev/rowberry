import { rowJson } from "../../../json/viewer";
import { recordDraft } from "../../app/workspace";
import { useRecoveryEnabled } from "../../app/useRecoveryEnabled";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtual rows and columns use ARIA grid semantics with absolute positions. */
import { JsonInspector, type ValidatedJsonDraft, type JsonSaveTarget } from "../json/JsonInspector";
import { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
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
  onTabState,
  onClose,
}: {
  table: Table;
  sessionId: SessionId;
  generation: number;
  onTabState?: (dirty: boolean, close: () => void, busy: boolean) => void;
  onClose?: () => void;
}) {
  const gridId = useId();
  const [input, setInput] = useState<FetchInput>({ tableId: initialTable.id });
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [reload, setReload] = useState(0);
  const state = useTablePage(sessionId, generation, input, reload);
  const [committedPage, setCommittedPage] = useState<RowPage | null>(null);
  const [outgoing, setOutgoing] = useState<{
    page: RowPage;
    number: number;
    input: FetchInput;
    generation: number;
    sessionId: SessionId;
  } | null>(null);
  const paging =
    state.kind === "loading" &&
    outgoing?.input === input &&
    outgoing.generation === generation &&
    outgoing.sessionId === sessionId;
  const page =
    committedPage ?? (state.kind === "ready" ? state.page : paging ? outgoing.page : null);
  if (outgoing && !paging) setOutgoing(null);
  const table = page?.table ?? initialTable;
  const [drafts, setDrafts] = useState<SaveInput["changes"]>([]);
  const [editor, setEditor] = useState<{
    target: string;
    column: string;
    original: string | null;
    text: string;
    sqlNull: boolean;
  } | null>(null);
  const recoveryEnabled = useRecoveryEnabled();
  useEffect(() => {
    const copies = drafts.map((draft) => ({ values: draft.values }));
    recordDraft(
      `table:${sessionId}:${initialTable.id}`,
      "table",
      `${initialTable.name} staged values (copy only)`,
      copies.length ? JSON.stringify(copies) : null,
    );
    recordDraft(
      `cell:${sessionId}:${initialTable.id}`,
      "cell",
      `${initialTable.name} cell ${editor?.column ?? ""} (copy only)`,
      editor ? editor.text : null,
    );
  }, [drafts, editor, sessionId, initialTable.id, initialTable.name, recoveryEnabled]);
  const [preview, setPreview] = useState<SaveInput["changes"] | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const cancelPreview = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (preview) {
      previewDialog.current?.showModal();
      cancelPreview.current?.focus();
    } else previewDialog.current?.close();
  }, [preview]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [compare, setCompare] = useState<RowPage | null>(null);
  const comparisonVersion = useRef(0);
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
    // Pending comparisons belong to the discarded draft and page.
    comparisonVersion.current++;
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
    if (editor) {
      setSaveStatus("Stage or cancel the current cell edit before editing another cell.");
      return;
    }
    const row = page.rows[rowIndex],
      column = table.columns[columnIndex],
      cell = row?.cells[columnIndex];
    if (!row?.target || !column || cell?.kind !== "value" || !cell.editable) return;
    if ([114, 3802].includes(cell.typeOid)) {
      void inspect(rowIndex, columnIndex);
      return;
    }
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
  function stageSelectedNull() {
    if (saving || preview || blocked || editor || jsonDirty || !page) return;
    const row = page.rows[selection.row],
      column = table.columns[selection.col],
      cell = row?.cells[selection.col];
    if (!row?.target || !column || cell?.kind !== "value" || !cell.editable) return;
    const target = row.target;
    setDrafts((current) => {
      const next = current.map((change) => ({ ...change, values: { ...change.values } }));
      let change = next.find((item) => item.target === target);
      if (!change) {
        change = { target, values: {} };
        next.push(change);
      }
      if (cell.text === null) delete change.values[column.name];
      else change.values[column.name] = null;
      return next.filter((item) => Object.keys(item.values).length);
    });
  }
  async function save() {
    if (!preview || saving || blocked || !page) return;
    const changes = preview;
    comparisonVersion.current++;
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
    if (
      !jsonSaveDraft &&
      !jsonDirty &&
      jsonTarget &&
      result.rows.some((item) => item.previousTarget === jsonTarget.target)
    ) {
      clearInspection();
      setSaveStatus(
        "Changes committed · clean JSON inspector closed; reopen JSON to edit the refreshed row.",
      );
    }
    if (jsonSaveDraft) {
      recordDraft(`json:${jsonSaveDraft.documentId}`, "json", "", null);
      const saved = result.rows.find(
        (item) => item.previousTarget === jsonSaveDraft.saveTarget.target,
      )?.row;
      const index = result.table.columns.findIndex(
        (column) => column.name === jsonSaveDraft.saveTarget.column,
      );
      const cell = saved?.cells[index];
      if (saved?.target && cell?.kind === "value" && cell.text !== null) {
        setInspected(cell.text);
        setOriginalSqlNull(false);
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
    const version = ++comparisonVersion.current;
    const reply = await window.dbapp.request({
      kind: "rows.fetch",
      sessionId,
      generation,
      requestId: RequestIdSchema.parse(crypto.randomUUID()),
      ...FetchSchema.parse(input),
    });
    if (!alive.current || version !== comparisonVersion.current) return;
    if (reply.ok && reply.kind === "rows.fetch") {
      setCompare(reply.data);
      setBlocked(true);
    } else
      setSaveStatus(
        "Current rows unavailable. Drafts and original targets retained; reconnect explicitly.",
      );
  }
  function newFilter() {
    return {
      id: crypto.randomUUID(),
      column: table.columns[0]?.name ?? "",
      operator: "eq",
      value: "",
    };
  }
  const [conditions, setConditions] = useState(() => [newFilter()]);
  const focusFilter = useRef<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  function updateCondition(
    id: string,
    change: Partial<Pick<(typeof conditions)[number], "column" | "operator" | "value">>,
  ) {
    setConditions((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }
  function removeCondition(id: string) {
    const index = appliedIds.indexOf(id);
    if (index >= 0) {
      if (!reset({ ...input, cursor: null, filter: input.filter?.filter((_, i) => i !== index) }))
        return;
      setAppliedIds(appliedIds.filter((key) => key !== id));
    }
    const remaining = conditions.filter((row) => row.id !== id);
    if (!remaining.length) remaining.push(newFilter());
    const removedIndex = conditions.findIndex((row) => row.id === id);
    focusFilter.current = remaining[Math.min(removedIndex, remaining.length - 1)]!.id;
    setConditions(remaining);
  }
  const [scroll, setScroll] = useState({ top: 0, left: 0, width: 1000, height: 500 });
  const [selection, setSelection] = useState({ row: 0, col: 0 });
  const [jsonTarget, setJsonTarget] = useState<JsonSaveTarget | undefined>();
  const [jsonDirty, setJsonDirty] = useState(false);
  const [originalSqlNull, setOriginalSqlNull] = useState(false);
  const [jsonId, setJsonId] = useState(crypto.randomUUID());
  useEffect(() => {
    onTabState?.(
      !!(drafts.length || editor || jsonDirty),
      () => {
        if (!discardAllowed()) return;
        recordDraft(`table:${sessionId}:${initialTable.id}`, "table", "", null);
        recordDraft(`cell:${sessionId}:${initialTable.id}`, "cell", "", null);
        recordDraft(`json:${jsonId}`, "json", "", null);
        onClose?.();
      },
      saving || !!preview,
    );
  });

  const [rowInspection, setRowInspection] = useState(false);
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
    recordDraft(`json:${jsonId}`, "json", "", null);
    inspectionVersion.current++;
    setInspected(null);
    setRowInspection(false);
    setOriginalSqlNull(false);
    setJsonSaveDraft(null);
    setJsonDirty(false);
    setInspectStatus("");
  }
  const firstRow = Math.max(0, Math.floor(scroll.top / HEIGHT) - 3),
    lastRow = Math.ceil((scroll.top + scroll.height) / HEIGHT) + 3;
  const [widths, setWidths] = useState(new Map<string, number>());
  const drag = useRef<{ x: number; width: number } | null>(null);
  let totalWidth = 0;
  const offsets = [0];
  for (const column of table.columns) {
    totalWidth += widths.get(column.name) ?? WIDTH;
    offsets.push(totalWidth);
  }
  const firstColumn = Math.max(0, offsets.findIndex((x) => x > scroll.left) - 2);
  const rightEdge = offsets.findIndex((x) => x >= scroll.left + scroll.width);
  const lastColumn = rightEdge < 0 ? table.columns.length : rightEdge + 1;
  const sort = input.sort?.[0];
  const sortDirection = sort?.direction === "asc" ? "ascending" : "descending";
  const workspace = useRef<HTMLElement>(null);
  const pendingSortFocus = useRef<FetchInput | null>(null);
  useLayoutEffect(() => {
    if (!pendingSortFocus.current) return;
    if (
      pendingSortFocus.current !== input ||
      state.kind === "error" ||
      document.activeElement !== workspace.current
    ) {
      pendingSortFocus.current = null;
      return;
    }
    if (!grid.current || !page) return;
    const index = table.columns.findIndex((column) => column.name === input.sort?.[0]?.column);
    const button = grid.current.querySelector<HTMLButtonElement>(
      `[role="columnheader"][aria-colindex="${index + 1}"] button`,
    );
    if (!button && index >= 0) {
      grid.current.scrollLeft = offsets[index] ?? 0;
      return;
    }
    pendingSortFocus.current = null;
    (button ?? grid.current).focus();
  });
  function resizeColumn(name: string, width: number) {
    setWidths((previous) => new Map(previous).set(name, Math.max(80, Math.min(4096, width))));
  }
  function paginate(cursor: string | null, nextHistory: (string | null)[]) {
    if (!page || paging || !discardAllowed()) return;
    const next = { ...input, cursor };
    setOutgoing({ page, number: history.length + 1, input: next, generation, sessionId });
    setCommittedPage(null);
    setHistory(nextHistory);
    setInput(next);
    clearInspection();
    resetViewport();
  }
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
  function inspectRow(rowIndex = selection.row) {
    if (!page || saving || preview || editor) return;
    const row = page.rows[rowIndex];
    if (!row) return;
    if (row.cells.some((cell) => cell.kind === "oversized")) {
      setSaveStatus(
        "This row contains omitted values. Inspect the JSON cell to fetch its full value.",
      );
      return;
    }
    if (jsonDirty && !window.confirm("Discard unsaved JSON draft before inspecting another value?"))
      return;
    clearInspection();
    setJsonTarget(undefined);
    setRowInspection(true);
    setJsonId(crypto.randomUUID());
    setInspected(
      rowJson(
        row.cells.map((cell, index) => ({
          name: table.columns[index]?.name ?? String(index),
          text: cell.text,
          typeOid: cell.typeOid,
        })),
      ),
    );
  }
  async function inspect(row: number, col: number) {
    if (editor) {
      setSaveStatus("Stage or cancel the current cell edit before inspecting another value.");
      return;
    }

    if (jsonDirty && !window.confirm("Discard unsaved JSON draft before inspecting another value?"))
      return;
    const version = ++inspectionVersion.current;
    if (!page || saving || preview) return;
    const record = page.rows[row],
      cell = record?.cells[col],
      column = table.columns[col];
    if (!cell || !column || ![114, 3802].includes(cell.typeOid)) return;
    recordDraft(`json:${jsonId}`, "json", "", null);
    setInspected(null);
    setRowInspection(false);
    setOriginalSqlNull(false);
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
      className={`table-workspace ${inspected !== null ? "has-json-panel" : ""}`}
      ref={workspace}
      tabIndex={-1}
      aria-label={`Table ${table.name}`}
      data-dirty={!!(drafts.length || editor || jsonDirty)}
      data-saving={saving}
      inert={paging}
      aria-busy={paging}
    >
      <div className="table-toolbar">
        <strong>
          {table.schema}.{table.name}
        </strong>
        <span>
          {table.editable
            ? "Stable row identity"
            : "Read-only · guarded saves require a suitable key, a writable table and table-level UPDATE permission"}
          {table.rls ? " · RLS" : ""}
        </span>
        <Button
          variant="ghost"
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
          variant="ghost"
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
      <dialog
        ref={previewDialog}
        className="save-preview"
        aria-label="Confirm database changes"
        onCancel={(event) => {
          event.preventDefault();
          if (!saving) setPreview(null);
        }}
      >
        <p>Review all original and pending values. This batch commits atomically.</p>
        {preview?.map((change) => (
          <div key={change.target}>
            <strong>
              Original row:{" "}
              {table.key
                .map((name) => {
                  const index = table.columns.findIndex((column) => column.name === name);
                  const cell = page?.rows.find((row) => row.target === change.target)?.cells[index];
                  return `${name}=${cell?.kind === "value" ? (cell.text === null ? "SQL NULL" : cell.text) : "Unavailable"}`;
                })
                .join(", ")}
            </strong>
            {Object.entries(change.values).map(([name, text]) => {
              const index = table.columns.findIndex((column) => column.name === name);
              const original = page?.rows.find((row) => row.target === change.target)?.cells[index];
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
                  <pre aria-label={`Pending ${name}`}>
                    {text === null
                      ? "SQL NULL"
                      : [114, 3802].includes(table.columns[index]?.typeOid ?? 0) &&
                          text.trim() === "null"
                        ? "JSON null"
                        : text}
                  </pre>
                </div>
              );
            })}
          </div>
        ))}
        <Button disabled={saving || blocked} onClick={() => void save()}>
          Confirm save
        </Button>
        <Button
          ref={cancelPreview}
          variant="ghost"
          disabled={saving}
          onClick={() => setPreview(null)}
        >
          Cancel preview
        </Button>
        {saving && <output>Saving…</output>}
      </dialog>
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
        className="filter-builder"
        aria-label="Table filters"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = FilterSchema.array().safeParse(
            conditions.map(({ column, operator, value }) => ({ column, operator, value })),
          );
          if (parsed.success && reset({ ...input, cursor: null, filter: parsed.data }))
            setAppliedIds(conditions.map((row) => row.id));
        }}
      >
        {conditions.map((row, i) => (
          <div className="filter-condition" key={row.id}>
            {i === 0 ? (
              <button type="submit" aria-label="Apply filter" title="Apply filters (Enter)">
                〈〉
              </button>
            ) : (
              <span className="filter-and">AND</span>
            )}
            <select
              aria-label={i ? `Filter column ${i + 1}` : "Filter column"}
              ref={(select) => {
                if (select && focusFilter.current === row.id) {
                  select.focus();
                  focusFilter.current = null;
                }
              }}
              value={row.column}
              onChange={(e) => updateCondition(row.id, { column: e.target.value })}
            >
              {table.columns.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
            <select
              aria-label={i ? `Filter operator ${i + 1}` : "Filter operator"}
              value={row.operator}
              onChange={(e) => updateCondition(row.id, { operator: e.target.value })}
            >
              <option value="eq">equals</option>
              <option value="ne">not equal</option>
              <option value="contains">contains</option>
              <option value="gt">greater than</option>
              <option value="gte">greater than or equal</option>
              <option value="lt">less than</option>
              <option value="lte">less than or equal</option>
              <option value="isNull">is NULL</option>
              <option value="isNotNull">is not NULL</option>
            </select>
            <input
              aria-label={i ? `Filter value ${i + 1}` : "Filter value"}
              value={row.value}
              disabled={row.operator === "isNull" || row.operator === "isNotNull"}
              onChange={(e) => updateCondition(row.id, { value: e.target.value })}
              maxLength={4096}
            />
            <button
              type="button"
              aria-label={conditions.length === 1 ? "Clear" : `Remove filter ${i + 1}`}
              title="Remove filter"
              onClick={() => removeCondition(row.id)}
            >
              −
            </button>
            {i === 0 && (
              <button
                type="button"
                aria-label="Add filter"
                title="Add AND condition"
                disabled={conditions.length >= 16}
                onClick={() => {
                  const next = newFilter();
                  focusFilter.current = next.id;
                  setConditions([...conditions, next]);
                }}
              >
                +
              </button>
            )}
          </div>
        ))}
      </form>
      {!table.key.length && (
        <p className="table-note">
          No suitable unique key. Rows are read-only; pages can shift when data changes.
        </p>
      )}
      {!page && state.kind === "loading" ? (
        <output className="table-note">Loading rows…</output>
      ) : !page && state.kind === "error" ? (
        <div className="table-note">
          <p role="alert">{state.message}</p>
          {(!!input.filter?.length || !!input.sort?.length) && (
            <Button
              variant="ghost"
              onClick={() => {
                if (!reset({ ...input, filter: [], sort: [], cursor: null })) return;
                const condition = newFilter();
                focusFilter.current = condition.id;
                setConditions([condition]);
                setAppliedIds([]);
              }}
            >
              Clear filters and sorting
            </Button>
          )}
        </div>
      ) : page ? (
        <>
          <span id={`${gridId}-keyboard-help`} className="sr-only">
            Use arrow keys to select a cell. Press Enter to inspect JSON. Use column buttons to
            sort.
          </span>
          <div
            className="grid-scroller"
            role="grid"
            aria-label="Table rows"
            aria-describedby={`${gridId}-keyboard-help`}
            aria-activedescendant={
              selection.row >= firstRow &&
              selection.row < lastRow &&
              selection.col >= firstColumn &&
              selection.col < lastColumn &&
              page.rows.length
                ? `${gridId}-cell-${selection.row}-${selection.col}`
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
              if (rowInspection && next.row !== selection.row) inspectRow(next.row);
              grid.current?.scrollTo({
                top: Math.max(0, (next.row - 2) * HEIGHT),
                left: Math.min(
                  offsets[next.col] ?? 0,
                  Math.max(
                    0,
                    (offsets[next.col + 1] ?? 0) - (grid.current?.clientWidth || scroll.width),
                  ),
                ),
              });
            }}
          >
            <div className="grid-header" role="row" aria-rowindex={1} style={{ width: totalWidth }}>
              {table.columns.slice(firstColumn, lastColumn).map((c, i) => (
                <div
                  role="columnheader"
                  aria-sort={sort?.column === c.name ? sortDirection : undefined}
                  aria-colindex={firstColumn + i + 1}
                  key={c.name}
                  style={{
                    position: "absolute",
                    left: offsets[firstColumn + i],
                    width: widths.get(c.name) ?? WIDTH,
                  }}
                >
                  <button
                    type="button"
                    aria-label={
                      sort?.column === c.name
                        ? `Sort by ${c.name}, sorted ${sortDirection}`
                        : `Sort by ${c.name}`
                    }
                    onClick={(event) => {
                      const next: FetchInput = {
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
                      };
                      if (reset(next) && event.detail === 0) {
                        pendingSortFocus.current = next;
                        workspace.current?.focus({ preventScroll: true });
                      }
                    }}
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
                  <div
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={`Resize ${c.name}`}
                    aria-valuenow={widths.get(c.name) ?? WIDTH}
                    aria-valuemin={80}
                    aria-valuemax={4096}
                    className="column-resizer"
                    onPointerDown={(e) => {
                      if (e.button !== 0 || !e.isPrimary) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = { x: e.clientX, width: widths.get(c.name) ?? WIDTH };
                    }}
                    onPointerMove={(e) => {
                      if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId))
                        resizeColumn(c.name, drag.current.width + e.clientX - drag.current.x);
                    }}
                    onLostPointerCapture={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                      e.preventDefault();
                      resizeColumn(
                        c.name,
                        (widths.get(c.name) ?? WIDTH) + (e.key === "ArrowRight" ? 20 : -20),
                      );
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                height: page.rows.length * HEIGHT,
                width: totalWidth,
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
                    width: totalWidth,
                  }}
                >
                  {row.cells.slice(firstColumn, lastColumn).map((cell, j) => (
                    <div
                      tabIndex={-1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void inspect(firstRow + i, firstColumn + j);
                      }}
                      id={`${gridId}-cell-${firstRow + i}-${firstColumn + j}`}
                      role="gridcell"
                      aria-colindex={firstColumn + j + 1}
                      aria-selected={
                        selection.row === firstRow + i && selection.col === firstColumn + j
                      }
                      key={firstColumn + j}
                      className={`grid-cell ${cell.text === null ? "muted-cell" : ""}`}
                      style={{
                        position: "absolute",
                        left: offsets[firstColumn + j],
                        width: widths.get(table.columns[firstColumn + j]?.name ?? "") ?? WIDTH,
                        height: HEIGHT,
                      }}
                      onClick={() => {
                        setSelection({ row: firstRow + i, col: firstColumn + j });
                        if (rowInspection && firstRow + i !== selection.row)
                          inspectRow(firstRow + i);
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
              {page.rows.length} rows · page {paging ? outgoing.number : history.length + 1}
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
              onClick={() => paginate(history.at(-1) ?? null, history.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="default"
              disabled={!page.nextCursor}
              onClick={() => paginate(page.nextCursor ?? null, [...history, input.cursor ?? null])}
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
            <Button
              disabled={
                saving ||
                blocked ||
                !!editor ||
                jsonDirty ||
                !page.rows[selection.row]?.cells[selection.col]?.editable
              }
              variant="ghost"
              onClick={stageSelectedNull}
            >
              Stage selected SQL NULL
            </Button>
            <Button
              variant="ghost"
              disabled={saving || !!preview || !!editor}
              onClick={() => inspectRow()}
            >
              Inspect selected row
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
          readOnly={rowInspection}
          title={rowInspection ? "Row as JSON" : "JSON viewer"}
          originalSqlNull={originalSqlNull}
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
            {inspectStatus === "SQL NULL" && jsonTarget && (
              <Button
                disabled={saving || blocked || !!drafts.length || !!editor}
                onClick={() => {
                  setOriginalSqlNull(true);
                  setInspected("null");
                  setJsonId(crypto.randomUUID());
                }}
              >
                Create JSON value
              </Button>
            )}
            <Button variant="ghost" onClick={clearInspection}>
              Close inspection
            </Button>
          </section>
        )
      )}
    </section>
  );
}
