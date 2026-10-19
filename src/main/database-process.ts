import { utilityProcess, type UtilityProcess } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SessionIdSchema,
  boundedReply,
  failure,
  type Reply,
  type Command,
  type BrowseCommand,
  type AppEvent,
  type ConnectionId,
  type SessionId,
} from "../shared/protocol";
import { WorkerEventSchema, type ResolvedConnection, type SessionResult } from "../database/types";
interface ActiveSession {
  sessionId: SessionId;
  profileId: ConnectionId;
  generation: number;
  worker: UtilityProcess | null;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}
const connectionError = () => new Error("Database connection failed.");
// One workspace owns one worker. Switching invalidates the previous generation
// before reading credentials, so neither slow vault reads nor old worker replies win.
export class DatabaseProcess {
  private pending = new Map<
    Command["requestId"],
    { resolve: (reply: Reply) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private generation = 0;
  private active: ActiveSession | null = null;
  constructor(
    private readonly emit: (event: AppEvent) => void,
    private readonly workerPath = path.join(__dirname, "../database/index.cjs"),
  ) {}
  private state(active: ActiveSession, state: "connecting" | "connected" | "disconnected") {
    this.emit({
      kind: "sessions.state",
      sessionId: active.sessionId,
      profileId: active.profileId,
      generation: active.generation,
      state,
    });
  }
  open(
    profileId: ConnectionId,
    resolve: () => Promise<Pick<ResolvedConnection, "profile" | "password">>,
  ): Promise<SessionResult> {
    this.stop();
    return new Promise((accept, reject) => {
      const active: ActiveSession = {
        sessionId: SessionIdSchema.parse(randomUUID()),
        profileId,
        generation: ++this.generation,
        worker: null,
        reject,
        timer: null,
      };
      this.active = active;
      this.state(active, "connecting");
      active.timer = setTimeout(() => {
        if (this.active === active) this.stop();
      }, 15000);
      void resolve()
        .then((resolved) => {
          if (this.active !== active) return;
          const worker = utilityProcess.fork(this.workerPath, [], {
            serviceName: "Database session",
            stdio: "ignore",
          });
          active.worker = worker;
          worker.on("message", (input: unknown) => {
            if (this.active !== active) return;
            const parsed = WorkerEventSchema.safeParse(input);
            if (parsed.success && parsed.data.kind === "reply") {
              const reply = parsed.data.reply;
              if (reply.requestId) {
                const pending = this.pending.get(reply.requestId);
                if (pending) {
                  clearTimeout(pending.timer);
                  this.pending.delete(reply.requestId);
                  pending.resolve(reply);
                }
              }
              return;
            }
            if (!parsed.success || parsed.data.kind !== "connected") {
              this.stop();
              return;
            }
            const result = parsed.data.data;
            if (result.sessionId !== active.sessionId || result.generation !== active.generation) {
              this.stop();
              return;
            }
            if (active.timer) clearTimeout(active.timer);
            active.timer = null;
            this.state(active, "connected");
            accept(result);
          });
          worker.once("exit", () => {
            if (this.active === active) this.stop();
          });
          worker.postMessage({
            kind: "open",
            config: { ...resolved, sessionId: active.sessionId, generation: active.generation },
          });
        })
        .catch(() => {
          if (this.active === active) this.stop();
        });
    });
  }
  request(command: BrowseCommand): Promise<Reply> {
    const active = this.active;
    if (
      !active?.worker ||
      active.sessionId !== command.sessionId ||
      active.generation !== command.generation ||
      this.pending.size >= 8 ||
      this.pending.has(command.requestId)
    )
      return Promise.resolve(failure("UNAVAILABLE", command.requestId));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId);
        resolve(failure("UNAVAILABLE", command.requestId));
      }, 40000);
      this.pending.set(command.requestId, {
        timer,
        resolve: (reply) =>
          resolve(
            boundedReply(reply, command.kind) && (!reply.ok || reply.kind === command.kind)
              ? reply
              : failure("UNAVAILABLE", command.requestId),
          ),
      });
      active.worker?.postMessage({ kind: "browse", command });
    });
  }
  close(sessionId: SessionId): void {
    if (this.active?.sessionId === sessionId) this.stop();
  }
  stop(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve(failure("UNAVAILABLE", id));
    }
    this.pending.clear();
    if (active.timer) clearTimeout(active.timer);
    // Killing the isolated worker also closes sockets during DNS, TLS and auth,
    // when a driver-level close cannot guarantee prompt cancellation.
    active.worker?.kill();
    active.reject(connectionError());
    this.state(active, "disconnected");
  }
}
