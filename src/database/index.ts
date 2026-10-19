import { openSession, type Session } from "./connections";
import { WorkerCommandSchema } from "./types";
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
    await session?.client.end().catch(() => {});
    port.postMessage({ kind: "disconnected" });
    process.exit(0);
  }
  if (opening) {
    port.postMessage({ kind: "failed" });
    return;
  }
  opening = true;
  try {
    session = await openSession(command.data.config, controller.signal);
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
