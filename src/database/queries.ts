import Cursor from "pg-cursor";
import { DatabaseError, type QueryResult } from "pg";
import { openSession, textParsers, type Session } from "./connections";
import type { ResolvedConnection } from "./types";

export type TransactionState = "idle" | "active" | "aborted" | "unknown";
export type QueryStatus = "running" | "complete" | "error" | "cancelled" | "limit" | "unknown";
export interface QueryPage {
  queryId: string;
  fields: { name: string; typeOid: number }[];
  rows: (string | null)[][];
  done: boolean;
  status: QueryStatus;
  transaction: TransactionState;
  durationMs: number;
  command: string | null;
  rowCount: number | null;
  error: string | null;
}
const MAX_BYTES = 16 * 1024 * 1024;
// pg-cursor normally accumulates every DataRow, including when a backend ignores
// Execute's row count (notably some non-SELECT commands). Override its receiver
// so even that case cannot accumulate an unbounded JS array. This adapter depends
// on the pinned pg-cursor receiver/_rows contract, covered by real server tests.
class BoundedCursor extends Cursor<(string | null)[]> {
  _rows: (string | null)[][] = [];
  failed = false;
  ended = false;
  budget = 0;
  bytes = 0;
  exceeded = false;
  overflow: () => void = () => {};
  unsupportedCopy = false;
  abortCopy: () => void = () => {};
  handleCopyInResponse() {
    this.rejectCopy();
  }
  handleCopyData() {
    this.rejectCopy();
  }
  private rejectCopy() {
    if (this.unsupportedCopy) return;
    this.unsupportedCopy = true;
    this.abortCopy();
  }
  handleDataRow(message: { fields: (string | null)[] }) {
    const bytes = Buffer.byteLength(JSON.stringify(message.fields), "utf8") + 1;
    if (this._rows.length >= this.budget || this.bytes + bytes > MAX_BYTES - 65536) {
      if (!this.exceeded) {
        this.exceeded = true;
        this.overflow();
      }
      return;
    }
    this.bytes += bytes;
    this._rows.push(message.fields);
  }
  page(size: number): Promise<{ rows: (string | null)[][]; result: QueryResult }> {
    this.budget = size;
    this.bytes = 0;
    return new Promise((resolve, reject) => {
      this.read(size, (error, rows, result) => (error ? reject(error) : resolve({ rows, result })));
    });
  }
}
interface Tab {
  session: Session;
  config: ResolvedConnection;
  pid: number;
  transaction: TransactionState;
  query?: Execution;
  closed: boolean;
}
interface Execution {
  id: string;
  tab: Tab;
  cursor: BoundedCursor;
  start: number;
  status: QueryStatus;
  error: string | null;
  fields: QueryPage["fields"];
  command: string | null;
  rowCount: number | null;
  returnedRows: number;
  busy: boolean;
  closing: boolean;
  cancelling?: Promise<void>;
  cancelled: boolean;
  cancelPending: boolean;
  finished?: number;
}
/** Worker-only: resolved secrets and every PostgreSQL socket stay here. */
export class QueryEngine {
  private tabs = new Map<string, Tab>();
  private queries = new Map<string, Execution>();
  private opening = new Map<string, AbortController>();
  constructor(private readonly changed: (page: Omit<QueryPage, "rows">) => void = () => {}) {}
  private pending = new Map<string, Promise<void>>();
  openTab(tabId: string, config: ResolvedConnection) {
    if (this.pending.has(tabId) || this.tabs.has(tabId))
      return Promise.reject(new Error("SQL tab already exists."));
    const operation = this.initializeTab(tabId, config);
    this.pending.set(tabId, operation);
    void operation
      .finally(() => {
        if (this.pending.get(tabId) === operation) this.pending.delete(tabId);
      })
      .catch(() => {});
    return operation;
  }
  private async initializeTab(tabId: string, config: ResolvedConnection) {
    if (this.tabs.has(tabId) || this.opening.has(tabId)) throw new Error("SQL tab already exists.");
    const controller = new AbortController();
    this.opening.set(tabId, controller);
    try {
      const session = await openSession(config, controller.signal);
      // pg's client read timer assumes Query.callback is eventually invoked.
      // Cursor does not use that callback, so its timer can fire while a portal
      // is suspended and send Sync, committing an implicit mutation. Disable it
      // for this dedicated client; PostgreSQL statement_timeout bounds each
      // Execute rather than the user's time between page requests.
      const parameters =
        "connectionParameters" in session.client ? session.client.connectionParameters : undefined;
      if (
        typeof parameters !== "object" ||
        parameters === null ||
        !("query_timeout" in parameters)
      ) {
        await session.client.end();
        throw new Error("Unsupported PostgreSQL client timeout contract.");
      }
      parameters.query_timeout = 0;
      const pid = "processID" in session.client ? session.client.processID : undefined;
      if (typeof pid !== "number" || !Number.isSafeInteger(pid)) {
        await session.client.end();
        throw new Error("Missing backend identity.");
      }
      if (controller.signal.aborted) {
        await session.client.end();
        throw new Error("SQL tab closed.");
      }
      const tab: Tab = { session, config, pid, transaction: "idle", closed: false };
      // ReadyForQuery is authoritative even for SQL functions, comments, and
      // errors. Never infer transaction or mutation safety from SQL prefixes.
      session.client.connection.on("readyForQuery", (message: { status: string }) => {
        tab.transaction =
          message.status === "I"
            ? "idle"
            : message.status === "T"
              ? "active"
              : message.status === "E"
                ? "aborted"
                : "unknown";
        if (tab.query && !tab.query.busy) this.emit(tab.query);
      });
      const lost = () => {
        tab.closed = true;
        tab.transaction = "unknown";
        if (tab.query?.status === "running" || tab.query?.cancelPending) {
          tab.query.status = "unknown";
          tab.query.error =
            "Connection lost; outcome unknown. Do not retry mutations automatically.";
          this.emit(tab.query);
        }
      };
      session.client.on("error", lost);
      session.client.on("end", lost);
      this.tabs.set(tabId, tab);
    } finally {
      this.opening.delete(tabId);
    }
  }
  start(tabId: string, sql: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.closed) throw new Error("SQL tab is unavailable.");
    if (tab.query?.status === "running" || tab.query?.cancelPending || tab.query?.closing)
      throw new Error("Finish or close the current result first.");
    if (!sql.trim() || Buffer.byteLength(sql) > 1024 * 1024)
      throw new Error("SQL must contain 1 byte to 1 MiB.");
    // Extended Parse accepts one statement only. PostgreSQL rejects batches before
    // executing any of their statements; no home-grown SQL splitter is used.
    if (tab.query) this.queries.delete(tab.query.id);
    const cursor = new BoundedCursor(sql, [], { rowMode: "array", types: textParsers });
    const execution: Execution = {
      id: crypto.randomUUID(),
      tab,
      cursor,
      start: performance.now(),
      status: "running",
      error: null,
      fields: [],
      command: null,
      rowCount: null,
      returnedRows: 0,
      busy: false,
      closing: false,
      cancelled: false,
      cancelPending: false,
    };
    cursor.on("end", () => {
      cursor.ended = true;
    });
    cursor.on("error", (error: unknown) => {
      cursor.failed = true;
      // Errors can arrive before the first fetch or while a portal is idle.
      // They must still terminate the visible execution state.
      if (!execution.busy) {
        if (
          error instanceof DatabaseError &&
          error.severity !== "FATAL" &&
          !error.code?.startsWith("08")
        ) {
          execution.status = "error";
          execution.error = error.message.slice(0, 4096);
        } else {
          execution.status = "unknown";
          execution.error =
            "Connection failed; outcome unknown. Do not retry mutations automatically.";
          tab.closed = true;
          tab.transaction = "unknown";
          void tab.session.client.end().catch(() => {});
        }
        this.emit(execution);
      }
    });
    cursor.abortCopy = () => {
      void tab.session.client.end().catch(() => {});
    };
    cursor.overflow = () => {
      void this.cancel(execution.id).catch(() => {});
    };
    tab.query = execution;
    this.queries.set(execution.id, execution);
    tab.session.client.query(cursor);
    this.emit(execution);
    return { queryId: execution.id };
  }
  async fetch(queryId: string, pageSize = 200): Promise<QueryPage> {
    const query = this.require(queryId);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000)
      throw new Error("Page size must be 1–1,000.");
    if (query.busy || query.closing) throw new Error("A fetch or result close is already pending.");
    if (query.status !== "running") return this.snapshot(query, []);
    query.busy = true;
    let rows: (string | null)[][] = [];
    try {
      const page = await query.cursor.page(pageSize);
      rows = page.rows;
      query.fields = page.result.fields.map((field) => ({
        name: field.name,
        typeOid: field.dataTypeID,
      }));
      query.command = page.result.command || null;
      query.returnedRows += rows.length;
      // A suspended portal's final CommandComplete count can cover only its
      // final Execute. Row-producing commands report the cumulative delivered
      // count; commands without rows retain the server command tag count.
      query.rowCount = query.fields.length ? query.returnedRows : page.result.rowCount;
      if (query.cursor.ended) query.status = "complete";
      if (
        query.cursor.exceeded ||
        Buffer.byteLength(JSON.stringify(this.snapshot(query, rows))) > MAX_BYTES
      ) {
        rows = [];
        query.status = "limit";
        query.error =
          "Result exceeds the 16 MiB page or server row-count budget. A single oversized row must be materialized by the driver before rejection. Execution may have changed data; inspect before retrying.";
        await query.cancelling;
        if (!query.cursor.failed) await query.cursor.close();
      }
    } catch (error) {
      if (
        query.tab.closed ||
        !(error instanceof DatabaseError) ||
        error.severity === "FATAL" ||
        error.code?.startsWith("08")
      ) {
        query.status = "unknown";
        query.tab.closed = true;
        void query.tab.session.client.end().catch(() => {});
        query.tab.transaction = "unknown";
        query.error = query.cursor.unsupportedCopy
          ? "COPY streaming is unsupported in SQL tabs. Connection closed; outcome unknown. Do not retry mutations automatically."
          : "Connection failed; outcome unknown. Do not retry mutations automatically.";
      } else {
        query.status = query.cursor.exceeded
          ? "limit"
          : query.cancelled && error.code === "57014"
            ? "cancelled"
            : "error";
        query.error = query.cursor.exceeded
          ? "Result exceeds page limits. Execution outcome may be unknown; inspect before retrying."
          : error.code === "42601" && error.message.includes("multiple commands")
            ? "Run one statement at a time. Batches are rejected before execution."
            : error.message.slice(0, 4096);
        // pg-cursor delivers errors before ReadyForQuery. This queued no-op waits
        // for resynchronization without committing, rolling back, or retrying SQL.
        await query.tab.session.client.query("", []).catch(() => {});
      }
    } finally {
      query.busy = false;
    }
    this.emit(query);
    return this.snapshot(query, rows);
  }
  async cancel(queryId: string) {
    const query = this.require(queryId);
    if (query.closing && !query.cancelling) throw new Error("SQL result is closing.");
    if (query.status !== "running" || query.cancelling) return query.cancelling;
    query.cancelled = true;
    query.cancelPending = true;
    query.cancelling = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      let control: Session | undefined;
      const abort = () => {
        void control?.client.end().catch(() => {});
      };
      controller.signal.addEventListener("abort", abort, { once: true });
      try {
        control = await openSession(
          { ...query.tab.config, connectTimeoutMs: 2000 },
          controller.signal,
        );
        controller.signal.throwIfAborted();
        await control.client.query("SELECT pg_cancel_backend($1)", [query.tab.pid]);
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", abort);
        await control?.client.end().catch(() => {});
      }
      // A suspended portal has no active server statement to cancel.
      if (!query.busy && query.status === "running") {
        if (!query.cursor.failed) await query.cursor.close();
        query.status = "cancelled";
        query.error = "Result closed. Previously completed changes are not undone.";
        this.emit(query);
      }
    })().finally(() => {
      query.cancelPending = false;
    });
    return query.cancelling;
  }
  async close(queryId: string) {
    const query = this.require(queryId);
    if (query.busy || query.closing)
      throw new Error("Cancel the active fetch or wait for result close.");
    query.closing = true;
    try {
      // Keep tab.query owned while a delayed control connection can still send
      // pg_cancel_backend. Releasing it first could cancel the next SQL command.
      await query.cancelling;
      if (!query.cursor.failed) await query.cursor.close();
      this.queries.delete(queryId);
      if (query.tab.query === query) query.tab.query = undefined;
    } finally {
      query.closing = false;
    }
  }

  async closeTab(tabId: string) {
    this.opening.get(tabId)?.abort();
    await this.pending.get(tabId)?.catch(() => {});
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.closed = true;
    this.tabs.delete(tabId);
    if (tab.query?.busy) await this.cancel(tab.query.id).catch(() => {});
    // Socket termination is intentionally used on tab close: PostgreSQL rolls
    // back open transactions, and an in-flight outcome is conservatively unknown.
    await tab.session.client.end().catch(() => {});
    await tab.query?.cancelling?.catch(() => {});
    for (const [id, query] of this.queries) if (query.tab === tab) this.queries.delete(id);
  }
  async closeAll() {
    for (const controller of this.opening.values()) controller.abort();
    await Promise.allSettled([...this.pending.values()]);
    await Promise.all([...this.tabs.keys()].map((id) => this.closeTab(id)));
  }
  private require(id: string) {
    const query = this.queries.get(id);
    if (!query) throw new Error("Unknown SQL result.");
    return query;
  }
  private snapshot(query: Execution, rows: QueryPage["rows"]): QueryPage {
    return {
      queryId: query.id,
      fields: query.fields,
      rows,
      done: query.status !== "running",
      status: query.status,
      transaction: query.tab.transaction,
      durationMs: (query.finished ?? performance.now()) - query.start,
      command: query.command,
      rowCount: query.rowCount,
      error: query.error,
    };
  }
  state(queryId: string) {
    return this.snapshot(this.require(queryId), []);
  }
  private emit(query: Execution) {
    if (query.status !== "running") query.finished ??= performance.now();
    const { rows: _rows, ...state } = this.snapshot(query, []);
    this.changed(state);
  }
}
