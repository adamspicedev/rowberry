import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { ResolvedConnectionSchema, type ResolvedConnection } from "./types";
import type { SessionResult } from "./types";
export interface Session extends SessionResult {
  client: Client;
  transaction: "idle" | "active" | "aborted";
}
// Text protocol throughout: no JSON parsing, date conversion, bytea decoding or
// numeric/array coercion can discard information before a cell reaches the UI.
export const textParsers = { getTypeParser: (_oid: number) => (value: string) => value };
export async function openSession(
  input: ResolvedConnection,
  signal?: AbortSignal,
): Promise<Session> {
  const config = ResolvedConnectionSchema.parse(input);
  const { profile } = config;
  signal?.throwIfAborted();
  const ssl =
    profile.tls.kind === "disable"
      ? false
      : profile.tls.kind === "require"
        ? { rejectUnauthorized: false }
        : {
            rejectUnauthorized: true,
            ...(profile.tls.caPath ? { ca: await readFile(profile.tls.caPath, "utf8") } : {}),
            ...(profile.tls.client
              ? {
                  cert: await readFile(profile.tls.client.certPath, "utf8"),
                  key: await readFile(profile.tls.client.keyPath, "utf8"),
                }
              : {}),
          };
  signal?.throwIfAborted();
  const client = new Client({
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    password: config.password ?? "",
    ssl,
    types: textParsers,
    connectionTimeoutMillis: config.connectTimeoutMs,
    statement_timeout: 30000,
    query_timeout: 35000,
    application_name: "dbapp",
    keepAlive: true,
  });
  // An idle socket error is expected during a restart and must never crash Node.
  client.on("error", () => {});
  const abort = () => {
    void client.end().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await client.connect();
    signal?.throwIfAborted();
    const result = await client.query<{ server_version: string }>("SHOW server_version");
    const serverVersion = result.rows[0]?.server_version;
    if (!serverVersion) throw new Error();
    return {
      client,
      sessionId: config.sessionId,
      generation: config.generation,
      serverVersion,
      transaction: "idle",
    };
  } catch {
    await client.end().catch(() => {});
    throw new Error(
      "Database connection failed. Check credentials, TLS settings and server availability.",
    );
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
