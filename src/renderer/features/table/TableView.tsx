/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Virtual rows and columns use ARIA grid semantics with absolute positions. */
import { JsonInspector, type JsonSaveTarget } from "../json/JsonInspector";
import { useState, useRef, useEffect } from "react";
import { RequestIdSchema, type SessionId } from "../../../shared/protocol";
import { FilterSchema, type Table, type FetchInput } from "../../../shared/browse";
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
  const table = state.kind === "ready" ? state.page.table : initialTable;
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
    if (jsonDirty && !window.confirm("Discard unsaved JSON draft before changing table view?"))
      return false;
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
    if (state.kind !== "ready") return;
    const record = state.page.rows[row],
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
    <section className="table-workspace" aria-label={`Table ${table.name}`}>
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
      {state.kind === "loading" ? (
        <output className="table-note">Loading rows…</output>
      ) : state.kind === "error" ? (
        <p role="alert" className="table-note">
          {state.message}
        </p>
      ) : (
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
              state.page.rows.length
                ? `table-cell-${selection.row}-${selection.col}`
                : undefined
            }
            aria-rowcount={state.page.rows.length + 1}
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
                    state.page.rows.length - 1,
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
                height: state.page.rows.length * HEIGHT,
                width: table.columns.length * WIDTH,
                position: "relative",
              }}
            >
              {state.page.rows.slice(firstRow, lastRow).map((row, i) => (
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
                      onDoubleClick={() => void inspect(firstRow + i, firstColumn + j)}
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
          {!state.page.rows.length && <output className="table-note">No rows found.</output>}
          <div className="table-pagination">
            <span>
              {state.page.rows.length} rows · page {history.length + 1}
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
                if (
                  jsonDirty &&
                  !window.confirm("Discard unsaved JSON draft before changing page?")
                )
                  return;
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
              disabled={!state.page.nextCursor}
              onClick={() => {
                if (
                  jsonDirty &&
                  !window.confirm("Discard unsaved JSON draft before changing page?")
                )
                  return;
                setHistory((h) => [...h, input.cursor ?? null]);
                setInput({ ...input, cursor: state.page.nextCursor });
                clearInspection();
                resetViewport();
              }}
            >
              Next
            </Button>
            <Button variant="ghost" onClick={() => void inspect(selection.row, selection.col)}>
              Inspect selected JSON
            </Button>
          </div>
        </>
      )}
      {inspected !== null ? (
        <JsonInspector
          key={jsonId}
          documentId={jsonId}
          sourceText={inspected}
          saveTarget={jsonTarget}
          onClose={clearInspection}
          onDirtyChange={setJsonDirty}
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
