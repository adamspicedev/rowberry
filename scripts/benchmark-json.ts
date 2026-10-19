import { cpus, platform, arch } from "node:os";
import { largeJsonFixture, nestedJsonFixture } from "../tests/fixtures/json/generate";
import type { JsonCommand, JsonReply } from "../src/json/protocol";
const worker = new Worker(new URL("../src/json/worker.ts", import.meta.url).href);
const listeners = new Set<(reply: JsonReply) => void>();
worker.addEventListener("message", (event: MessageEvent<JsonReply>) => {
  for (const listener of listeners) listener(event.data);
});
worker.addEventListener("error", (event) => {
  console.error(event);
  process.exitCode = 1;
});
function send(
  command: JsonCommand,
  done: (r: JsonReply) => boolean = (reply) =>
    reply.kind === "document" || reply.kind === "error" || reply.kind === "cancelled",
): Promise<JsonReply> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(listener);
      reject(new Error("Worker timed out"));
    }, 30000);
    const listener = (reply: JsonReply) => {
      if (reply.requestId !== command.requestId || !done(reply)) return;
      clearTimeout(timer);
      listeners.delete(listener);
      resolve(reply);
    };
    listeners.add(listener);
    worker.postMessage(command);
  });
}
try {
  const text = largeJsonFixture();
  console.log(
    JSON.stringify({
      machine: cpus()[0]?.model,
      platform: platform(),
      arch: arch(),
      bytes: new TextEncoder().encode(text).length,
      scalars: 100000,
    }),
  );
  let start = performance.now();
  const loaded = await send({
    kind: "load",
    documentId: "large",
    revision: 0,
    requestId: "load",
    text,
  });
  if (loaded.kind !== "document" || !loaded.document.editable) throw new Error("Large load failed");
  console.log("worker load ms", Math.round(performance.now() - start));
  let count = 0;
  const collect = (reply: JsonReply) => {
    if (reply.requestId === "search" && reply.kind === "matches") {
      if (reply.matches.length > 256) throw new Error("Batch exceeds limit");
      count += reply.matches.length;
    }
  };
  listeners.add(collect);
  start = performance.now();
  await send(
    {
      kind: "search",
      documentId: "large",
      revision: 0,
      requestId: "search",
      query: "99999:needle",
    },
    (r) => r.kind === "done",
  );
  const searchMs = performance.now() - start;
  listeners.delete(collect);
  console.log("worker search ms", Math.round(searchMs), "matches", count);
  if (count !== 1 || searchMs > 2000) throw new Error("Search acceptance target failed");
  const cancelled = send({
    kind: "load",
    documentId: "cancel",
    revision: 0,
    requestId: "cancel-load",
    text,
  });
  setTimeout(
    () =>
      worker.postMessage({
        kind: "cancel",
        documentId: "cancel",
        revision: 0,
        requestId: "cancel-command",
        targetRequestId: "cancel-load",
      }),
    5,
  );
  start = performance.now();
  if ((await cancelled).kind !== "cancelled")
    throw new Error("Parsing did not observe cancellation");
  console.log("worker parse cancel ms", Math.round(performance.now() - start));
  const searchCancelled = send(
    {
      kind: "search",
      documentId: "large",
      revision: 0,
      requestId: "cancel-search",
      query: "needle",
    },
    (r) => r.kind === "cancelled" || r.kind === "done",
  );
  setTimeout(
    () =>
      worker.postMessage({
        kind: "cancel",
        documentId: "large",
        revision: 0,
        requestId: "cancel-command2",
        targetRequestId: "cancel-search",
      }),
    5,
  );
  start = performance.now();
  if ((await searchCancelled).kind !== "cancelled")
    throw new Error("Search did not observe cancellation");
  console.log("worker search cancel ms", Math.round(performance.now() - start));
  const deep = await send({
    kind: "load",
    documentId: "deep",
    revision: 0,
    requestId: "deep",
    text: nestedJsonFixture(),
  });
  if (deep.kind !== "document" || !deep.document.editable)
    throw new Error("100-level fixture failed");
  console.log("100-level worker parse PASS");
} finally {
  worker.terminate();
}
