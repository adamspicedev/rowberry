import {
  applyOperation,
  documentSteps,
  redo,
  prepareMove,
  finishMove,
  recordTextEdit,
  undo,
  type JsonDocument,
  type Operation,
} from "./document";
import { commandSchema, documentView, type JsonReply } from "./protocol";
import { defaultYield, searchDocument } from "./search";
type Job = { cancelled: boolean; documentId: string; revision: number };
/** One instance per worker. Load revisions strictly increase for an id, including after release. */
export function createJsonWorker(post: (reply: JsonReply) => void, schedule = defaultYield) {
  const documents = new Map<string, JsonDocument>();
  const generations = new Map<string, number>();
  const jobs = new Map<string, Job>();
  const cancelDocument = (id: string) => {
    for (const job of jobs.values()) if (job.documentId === id) job.cancelled = true;
  };
  return async (input: unknown): Promise<void> => {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) return;
    const command = parsed.data;
    const { documentId, revision, requestId } = command;
    const identity = { documentId, revision, requestId };
    const error = (message: string) => post({ ...identity, kind: "error", message });
    if (command.kind === "cancel") {
      const target = jobs.get(command.targetRequestId);
      if (target?.documentId === documentId && target.revision === revision)
        target.cancelled = true;
      return;
    }
    if (command.kind === "release") {
      if (generations.get(documentId) !== revision) {
        error("Stale document revision");
        return;
      }
      cancelDocument(documentId);
      documents.delete(documentId);
      post({ ...identity, kind: "released" });
      return;
    }
    if (jobs.has(requestId)) {
      error("Request id is already active");
      return;
    }
    if (command.kind === "load") {
      if (revision <= (generations.get(documentId) ?? -1)) {
        error("Load requires a newer revision");
        return;
      }
      cancelDocument(documentId);
      generations.set(documentId, revision);
      documents.delete(documentId);
    } else if (documents.get(documentId)?.revision !== revision) {
      error("Stale document revision");
      return;
    }
    const job: Job = { cancelled: false, documentId, revision };
    jobs.set(requestId, job);
    const cancelled = () => job.cancelled || generations.get(documentId) !== revision;
    const parse = async (text: string) => {
      const iterator = documentSteps(text);
      let step = iterator.next();
      let count = 0;
      while (!step.done) {
        if (cancelled()) return null;
        if (++count % 512 === 0) await schedule();
        step = iterator.next();
      }
      return cancelled() ? null : step.value;
    };
    try {
      if (
        command.kind === "load" ||
        (command.kind === "edit" && command.operation.kind === "text")
      ) {
        const text =
          command.kind === "load"
            ? command.text
            : command.operation.kind === "text"
              ? command.operation.text
              : "";
        const document = await parse(text);
        if (!document) {
          post({ ...identity, kind: "cancelled" });
          return;
        }
        const previous = documents.get(documentId);
        const nextRevision = command.kind === "load" ? revision : revision + 1;
        const next: JsonDocument = previous
          ? recordTextEdit(previous, document)
          : { ...document, revision: nextRevision };
        generations.set(documentId, nextRevision);
        documents.set(documentId, next);
        cancelDocument(documentId);
        post({
          ...identity,
          revision: nextRevision,
          kind: "document",
          document: documentView(next),
        });
      } else {
        const doc = documents.get(documentId);
        if (!doc) return;
        if (command.kind === "search") {
          const complete = await searchDocument(
            doc,
            command.query,
            (matches) => {
              if (!cancelled()) post({ ...identity, kind: "matches", matches });
            },
            { cancelled, yield: schedule },
          );
          post({ ...identity, kind: complete ? "done" : "cancelled" });
        } else {
          const op = command.operation;
          if (op.kind === "text") return;
          const reparse = (text: string): JsonDocument => ({ ...doc, text });
          const transform = async (
            base: JsonDocument,
            operation: Operation,
          ): Promise<JsonDocument | null> => {
            if (operation.kind === "move") {
              const move = prepareMove(base, operation);
              if (!move) return base;
              const removed = await transform(base, move.remove);
              if (!removed) return null;
              const added = await transform(removed, move.add);
              return added ? finishMove(base, added) : null;
            }
            if (
              (operation.kind === "set" || operation.kind === "add") &&
              operation.value.kind === "raw"
            ) {
              const fragment = await parse(operation.value.text);
              if (!fragment) return null;
              if (!fragment.editable)
                throw new Error("Raw input must be exactly one valid duplicate-free JSON value");
            }
            const prepared = applyOperation(base, operation, (text) => ({ ...base, text }));
            const result = await parse(prepared.text);
            if (!result) return null;
            if (!result.editable) throw new Error(result.diagnostics[0]?.message ?? "Invalid edit");
            return {
              ...result,
              revision: prepared.revision,
              past: prepared.past,
              future: prepared.future,
              historyBytes: prepared.historyBytes,
              historyTruncated: prepared.historyTruncated,
            };
          };
          let next: JsonDocument | null;
          if (op.kind === "undo" || op.kind === "redo") {
            const prepared = op.kind === "undo" ? undo(doc, reparse) : redo(doc, reparse);
            const result = await parse(prepared.text);
            next = result
              ? {
                  ...result,
                  revision: prepared.revision,
                  past: prepared.past,
                  future: prepared.future,
                  historyBytes: prepared.historyBytes,
                  historyTruncated: prepared.historyTruncated,
                }
              : null;
          } else next = await transform(doc, op);
          if (!next || cancelled()) {
            post({ ...identity, kind: "cancelled" });
            return;
          }
          cancelDocument(documentId);
          documents.set(documentId, next);
          generations.set(documentId, next.revision);
          post({
            ...identity,
            revision: next.revision,
            kind: "document",
            document: documentView(next),
          });
        }
      }
    } catch (cause) {
      if (!cancelled()) error(cause instanceof Error ? cause.message : "JSON operation failed");
    } finally {
      jobs.delete(requestId);
    }
  };
}
// Dedicated worker entry; DOM and worker environments share this narrow adapter.
if (
  typeof document === "undefined" &&
  "postMessage" in globalThis &&
  "addEventListener" in globalThis
) {
  const handle = createJsonWorker((reply) => globalThis.postMessage(reply));
  globalThis.addEventListener("message", (event) => {
    void handle(event.data);
  });
}
