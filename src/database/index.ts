import { QueryDispatch } from "./query-dispatch";
let queries: QueryDispatch | undefined;
import { openSession, type Session } from "./connections";
import { WorkerCommandSchema } from "./types";
import { introspect } from "./introspection";
import { RowBrowser, BrowseColumnLimitError } from "./rows";
import { boundedReply, failure } from "../shared/protocol";
let browser: RowBrowser | undefined;
let busy = false;
const port = process.parentPort;
if (!port) throw new Error("Database worker requires a private parent port.");
let session: Session | undefined;
const controller = new AbortController();
let opening = false;
port.on("message", async ({ data }: { data: unknown }) => {
  const command = WorkerCommandSchema.safeParse(data);
  if (!command.success) {
    port.postMessage({ kind: "failed" });
    return;
  }
  if (command.data.kind === "close") {
    controller.abort();
    await queries?.closeAll();
    await session?.client.end().catch(() => {});
    port.postMessage({ kind: "disconnected" });
    process.exit(0);
  }
  if (command.data.kind === "query") {
    const request = command.data.command;
    port.postMessage({
      kind: "reply",
      reply: queries ? await queries.request(request) : failure("UNAVAILABLE", request.requestId),
    });
    return;
  }
  if (command.data.kind === "browse") {
    const request = command.data.command;
    if (
      !session ||
      !browser ||
      session.sessionId !== request.sessionId ||
      session.generation !== request.generation ||
      busy
    ) {
      port.postMessage({ kind: "reply", reply: failure("UNAVAILABLE", request.requestId) });
      return;
    }
    busy = true;
    try {
      let data;
      if (request.kind === "schema.list") data = await introspect(session);
      else if (request.kind === "rows.fetch") {
        const { tableId, filter, sort, cursor, pageSize } = request;
        data = await browser.fetch({ tableId, filter, sort, cursor, pageSize });
      } else data = await browser.value({ target: request.target, column: request.column });
      const reply = { ok: true, kind: request.kind, requestId: request.requestId, data };
      port.postMessage({
        kind: "reply",
        reply: boundedReply(reply, request.kind)
          ? reply
          : failure("UNAVAILABLE", request.requestId),
      });
    } catch (error) {
      port.postMessage({
        kind: "reply",
        reply: failure(
          error instanceof BrowseColumnLimitError ? "BROWSE_COLUMN_LIMIT" : "UNAVAILABLE",
          request.requestId,
        ),
      });
    } finally {
      busy = false;
    }
    return;
  }
  if (opening) {
    port.postMessage({ kind: "failed" });
    return;
  }
  opening = true;
  try {
    session = await openSession(command.data.config, controller.signal);
    browser = new RowBrowser(session);
    queries = new QueryDispatch(command.data.config, (event) =>
      port.postMessage({ kind: "queryEvent", event }),
    );
    session.client.once("end", () => {
      port.postMessage({ kind: "disconnected" });
      process.exit(0);
    });
    session.client.once("error", () => {
      port.postMessage({ kind: "disconnected" });
      process.exit(1);
    });
    port.postMessage({
      kind: "connected",
      data: {
        sessionId: session.sessionId,
        generation: session.generation,
        serverVersion: session.serverVersion,
      },
    });
  } catch {
    port.postMessage({ kind: "failed" });
    process.exit(1);
  }
});
