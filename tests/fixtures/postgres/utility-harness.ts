import { app } from "electron";
import path from "node:path";
import { DatabaseProcess } from "../../../src/main/database-process";
import {
  ConnectionProfileSchema,
  type AppEvent,
  type SessionId,
} from "../../../src/shared/protocol";
import type { ResolvedConnection, SessionResult } from "../../../src/database/types";
export interface Harness {
  open(config: ResolvedConnection, credentialDelay?: number): Promise<SessionResult>;
  stop(): void;
  close(id: SessionId): void;
  crash(): void;
  events: AppEvent[];
}
declare global {
  var sessionHarness: Harness;
}
const events: AppEvent[] = [];
const supervisor = new DatabaseProcess(
  (event) => events.push(event),
  path.resolve("dist/database/index.cjs"),
);
app.whenReady().then(() => {
  globalThis.sessionHarness = {
    events,
    open: (config, delay = 0) =>
      supervisor.open(ConnectionProfileSchema.parse(config.profile).id, async () => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return { profile: config.profile, password: config.password };
      }),
    close: (id) => supervisor.close(id),
    stop: () => supervisor.stop(),
    crash: () => {
      const metric = app.getAppMetrics().find((item) => item.name === "Database session");
      if (!metric) throw new Error("Worker missing");
      process.kill(metric.pid, "SIGKILL");
    },
  };
});
app.on("will-quit", () => supervisor.stop());
