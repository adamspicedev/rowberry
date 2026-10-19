import type { JsonDocument, JsonNode, Range } from "./document";
import { escapePointer } from "./paths";
export type SearchMatch = { path: string; kind: "key" | "value"; range: Range };
export type WorkControl = { cancelled: () => boolean; yield: () => Promise<void> };
let taskChannel: MessageChannel | undefined;
let pendingTasks: (() => void)[] = [];
let lastFairTurn = performance.now();
/** One reusable normal-priority task queue. Unlike nested timers, posted messages are not clamped. */
export function defaultYield(): Promise<void> {
  // Legacy/test runtimes without MessageChannel still yield a task, never only a microtask.
  if (typeof MessageChannel === "undefined")
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!taskChannel) {
    taskChannel = new MessageChannel();
    const receivingPort = taskChannel.port1;
    receivingPort.onmessage = () => {
      const ready = pendingTasks;
      pendingTasks = [];
      // Node/Bun ports should keep a pending yield alive, but never retain an idle process.
      if ("unref" in receivingPort && typeof receivingPort.unref === "function")
        receivingPort.unref();
      for (const resolve of ready) resolve();
    };
    const sendingPort = taskChannel.port2;
    if ("unref" in sendingPort && typeof sendingPort.unref === "function") sendingPort.unref();
  }
  const channel = taskChannel;
  return new Promise<void>((resolve) => {
    pendingTasks.push(resolve);
    if (pendingTasks.length === 1) {
      if ("ref" in channel.port1 && typeof channel.port1.ref === "function") channel.port1.ref();
      // Some runtimes prefer message-port tasks over external worker messages. Periodically
      // leave that task source entirely, so load/cancel/release messages cannot starve.
      if (performance.now() - lastFairTurn >= 8) {
        setTimeout(() => {
          lastFairTurn = performance.now();
          channel.port2.postMessage(null);
        }, 0);
      } else channel.port2.postMessage(null);
    }
  });
}
export async function searchDocument(
  doc: JsonDocument,
  query: string,
  emit: (matches: SearchMatch[]) => void,
  control: WorkControl = { cancelled: () => false, yield: defaultYield },
): Promise<boolean> {
  if (!query || !doc.root) return !control.cancelled();
  const stack: { node: JsonNode; path: string; key?: { text: string; range: Range } }[] = [
    { node: doc.root, path: "" },
  ];
  let batch: SearchMatch[] = [];
  let count = 0;
  const add = (match: SearchMatch) => {
    batch.push(match);
    if (batch.length === 256) {
      emit(batch);
      batch = [];
    }
  };
  while (stack.length) {
    if (control.cancelled()) return false;
    const item = stack.pop();
    if (!item) break;
    const { node, path, key } = item;
    if (key?.text.includes(query)) add({ path, kind: "key", range: key.range });
    if (node.kind === "object") {
      for (let i = node.entries.length - 1; i >= 0; i--) {
        const e = node.entries[i];
        if (e)
          stack.push({
            node: e.value,
            path: path + "/" + escapePointer(e.key),
            key: { text: e.key, range: e.keyRange },
          });
        if (++count % 512 === 0) {
          await control.yield();
          if (control.cancelled()) return false;
        }
      }
    } else if (node.kind === "array") {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) stack.push({ node: child, path: path + "/" + i });
        if (++count % 512 === 0) {
          await control.yield();
          if (control.cancelled()) return false;
        }
      }
    } else {
      const text = node.kind === "string" ? node.value : doc.text.slice(node.start, node.end);
      if (text.includes(query))
        add({ path, kind: "value", range: { start: node.start, end: node.end } });
    }
    if (++count % 512 === 0) await control.yield();
  }
  if (control.cancelled()) return false;
  if (batch.length) emit(batch);
  return true;
}
