/* oxlint-disable react/refs, react/immutability -- Worker callbacks use live command refs; no ref values drive rendering. */
import { useEffect, useRef, useState } from "react";
import type { JsonCommand, JsonDocumentView, JsonReply } from "../../../json/protocol";
import type { SearchMatch } from "../../../json/search";
type Operation = Extract<JsonCommand, { kind: "edit" }>["operation"];
export function useJsonDocument(documentId: string, sourceText: string) {
  const [document, setDocument] = useState<JsonDocumentView | null>(null);
  const [text, setText] = useState(sourceText);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const worker = useRef<Worker | null>(null);
  const revision = useRef(0);
  const job = useRef("");
  const jobKind = useRef("load");
  const searchJob = useRef("");
  const desired = useRef(sourceText);
  const committed = useRef(sourceText);
  const busy = useRef(true);
  const send = (command: JsonCommand) => worker.current?.postMessage(command);
  function cancelSearch() {
    if (searchJob.current)
      send({
        kind: "cancel",
        documentId,
        revision: revision.current,
        requestId: crypto.randomUUID(),
        targetRequestId: searchJob.current,
      });
    searchJob.current = "";
    setMatches([]);
    setSearching(false);
  }
  function edit(operation: Operation) {
    if (busy.current) return;
    cancelSearch();
    busy.current = true;
    setPending(true);
    setError("");
    jobKind.current = operation.kind;
    textAtDispatch.current = desired.current;
    job.current = crypto.randomUUID();
    send({
      kind: "edit",
      documentId,
      revision: revision.current,
      requestId: job.current,
      operation,
    });
  }
  const flush = useRef(() => {});
  flush.current = () => {
    if (!busy.current && desired.current !== committed.current)
      edit({ kind: "text", text: desired.current });
  };
  useEffect(() => {
    const instance = new Worker(new URL("../../../json/worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = instance;
    job.current = crypto.randomUUID();
    instance.onmessage = ({ data }: MessageEvent<JsonReply>) => {
      if (data.documentId !== documentId) return;
      if (data.requestId === searchJob.current && data.revision === revision.current) {
        if (data.kind === "matches") setMatches((old) => [...old, ...data.matches]);
        if (data.kind === "done" || data.kind === "error" || data.kind === "cancelled")
          setSearching(false);
      }
      if (
        data.requestId !== job.current ||
        data.revision < revision.current ||
        data.revision > revision.current + 1
      )
        return;
      if (data.kind === "document") {
        revision.current = data.revision;
        committed.current = data.document.text;
        setDocument(data.document);
        // Preserve newer keystrokes while the previous parse was running.
        if (desired.current === textAtDispatch.current) {
          desired.current = data.document.text;
          setText(data.document.text);
        }
        busy.current = false;
        setPending(false);
        queueMicrotask(() => flush.current());
      } else if (data.kind === "cancelled") {
        busy.current = false;
        setPending(false);
        queueMicrotask(() => flush.current());
      } else if (data.kind === "error") {
        busy.current = false;
        setPending(false);
        setError(data.message);
      }
    };
    instance.onerror = () => {
      setError("JSON worker could not start. Your source is retained.");
      setPending(false);
    };
    instance.postMessage({
      kind: "load",
      documentId,
      revision: 0,
      requestId: job.current,
      text: sourceText,
    } satisfies JsonCommand);
    return () => {
      instance.postMessage({
        kind: "release",
        documentId,
        revision: revision.current,
        requestId: crypto.randomUUID(),
      } satisfies JsonCommand);
      instance.terminate();
      worker.current = null;
    };
  }, [documentId, sourceText]);
  const textAtDispatch = useRef(sourceText);
  function changeText(next: string) {
    cancelSearch();
    desired.current = next;
    if (busy.current && jobKind.current === "text")
      send({
        kind: "cancel",
        documentId,
        revision: revision.current,
        requestId: crypto.randomUUID(),
        targetRequestId: job.current,
      });
    setText(next);
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      flush.current();
    }, 180);
    return () => clearTimeout(timer);
  }, [text]);
  function mutate(operation: Operation) {
    edit(operation);
  }
  function search(query: string) {
    cancelSearch();
    if (!query || busy.current || text !== document?.text) return;
    searchJob.current = crypto.randomUUID();
    setSearching(true);
    send({
      kind: "search",
      documentId,
      revision: revision.current,
      requestId: searchJob.current,
      query,
    });
  }
  return {
    document,
    text,
    changeText,
    pending: pending || text !== document?.text,
    error,
    mutate,
    matches,
    searching,
    search,
    cancelSearch,
  };
}
