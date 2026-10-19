import { QueryEngine, QueryTabClosedError } from "./queries";
import type { ResolvedConnection } from "./types";
import {
  boundedReply,
  failure,
  QueryIdSchema,
  ReplySchema,
  TabIdSchema,
  QueryPageSchema,
  SessionIdSchema,
  type QueryCommand,
  type AppEvent,
  type Reply,
} from "../shared/protocol";
/** Per-worker ownership: config remains private and cancellation bypasses fetch promises. */
export class QueryDispatch {
  private readonly engine: QueryEngine;
  private readonly tabs = new Map<string, { queryId: string | null }>();
  private readonly queries = new Map<
    string,
    { tabId: string; first: Promise<unknown> | null; fetching: boolean }
  >();
  private pending = 0;
  private closed = false;
  constructor(
    private readonly config: ResolvedConnection,
    emit: (event: AppEvent) => void = () => {},
  ) {
    this.engine = new QueryEngine((page) => {
      const query = this.queries.get(page.queryId);
      if (!query || this.closed) return;
      emit({
        kind: "queries.state",
        sessionId: SessionIdSchema.parse(config.sessionId),
        generation: config.generation,
        tabId: TabIdSchema.parse(query.tabId),
        queryId: QueryIdSchema.parse(page.queryId),
        status: page.status,
        transaction: page.transaction,
        error: page.error,
      });
    });
  }
  async closeAll() {
    this.closed = true;
    this.tabs.clear();
    this.queries.clear();
    await this.engine.closeAll();
  }
  async request(command: QueryCommand): Promise<Reply> {
    const { requestId, kind, tabId } = command;
    if (
      this.closed ||
      command.sessionId !== this.config.sessionId ||
      command.generation !== this.config.generation ||
      this.pending >= 32 ||
      (this.pending >= 31 && kind !== "queries.cancel" && kind !== "queries.closeTab")
    )
      return failure("QUERY_UNAVAILABLE", requestId);
    this.pending++;
    try {
      let data: unknown = {};
      if (kind === "queries.openTab") {
        if (this.tabs.size >= 16) return failure("QUERY_TAB_LIMIT", requestId);
        if (this.tabs.has(tabId)) return failure("QUERY_UNAVAILABLE", requestId);
        this.tabs.set(tabId, { queryId: null });
        try {
          await this.engine.openTab(tabId, this.config);
        } catch (error) {
          this.tabs.delete(tabId);
          throw error;
        }
      } else {
        const tab = this.tabs.get(tabId);
        if (!tab) return failure("QUERY_UNAVAILABLE", requestId);
        if (kind === "queries.closeTab") {
          this.tabs.delete(tabId);
          await this.engine.closeTab(tabId);
          if (tab.queryId) this.queries.delete(tab.queryId);
        } else if (kind === "queries.start") {
          const started = this.engine.start(tabId, command.sql);
          if (tab.queryId) this.queries.delete(tab.queryId);
          tab.queryId = started.queryId;
          const entry = { tabId, first: Promise.resolve<unknown>(null), fetching: false };
          // Drive the lazy portal immediately; retain only this single bounded first page.
          entry.first = this.engine.fetch(started.queryId).catch(() => {
            try {
              return this.engine.state(started.queryId);
            } catch {
              return null;
            }
          });
          this.queries.set(started.queryId, entry);
          data = { queryId: QueryIdSchema.parse(started.queryId) };
        } else {
          const query = this.queries.get(command.queryId);
          if (!query || query.tabId !== tabId || tab.queryId !== command.queryId)
            return failure("QUERY_UNAVAILABLE", requestId);
          if (kind === "queries.fetch") {
            if (query.fetching) return failure("QUERY_UNAVAILABLE", requestId);
            query.fetching = true;
            try {
              data = await (query.first ?? this.engine.fetch(command.queryId, command.pageSize));
              query.first = null;
            } finally {
              query.fetching = false;
            }
          } else if (kind === "queries.cancel") await this.engine.cancel(command.queryId);
          else {
            await this.engine.close(command.queryId);
            this.queries.delete(command.queryId);
            tab.queryId = null;
          }
        }
      }
      const reply = { ok: true, kind, requestId, data };
      // Include the entire envelope in the reply budget.
      if (!boundedReply(reply, kind)) {
        if (kind === "queries.fetch") {
          const page = QueryPageSchema.parse(data);
          return {
            ok: true,
            kind,
            requestId,
            data: {
              ...page,
              fields: [],
              rows: [],
              status: "limit",
              transaction: "unknown",
              error:
                "Result reply exceeds 16 MiB including column metadata. Work may have changed data. Close the tab to roll back any open transaction; inspect before retrying.",
            },
          };
        }
        return failure("QUERY_UNAVAILABLE", requestId);
      }
      return ReplySchema.parse(reply);
    } catch (error) {
      return failure(
        error instanceof QueryTabClosedError ? "QUERY_SESSION_CLOSED" : "QUERY_UNAVAILABLE",
        requestId,
      );
    } finally {
      this.pending--;
    }
  }
}
