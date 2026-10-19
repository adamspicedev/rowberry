import { useEffect, useState } from "react";
import { RequestIdSchema, type SessionId } from "../../../shared/protocol";
import { FetchSchema, type FetchInput, type RowPage } from "../../../shared/browse";
export type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; page: RowPage };
export function useTablePage(
  sessionId: SessionId,
  generation: number,
  input: FetchInput,
  reload: number,
) {
  const [result, setResult] = useState<{ key: string; state: PageState } | null>(null);
  const signature = JSON.stringify(input);
  const key = JSON.stringify([sessionId, generation, signature, reload]);
  useEffect(() => {
    let active = true;
    void window.dbapp
      .request({
        kind: "rows.fetch",
        sessionId,
        generation,
        requestId: RequestIdSchema.parse(crypto.randomUUID()),
        ...FetchSchema.parse(JSON.parse(signature)),
      })
      .then((reply) => {
        if (!active) return;
        setResult({
          key,
          state:
            reply.ok && reply.kind === "rows.fetch"
              ? { kind: "ready", page: reply.data }
              : {
                  kind: "error",
                  message:
                    !reply.ok && reply.error.code === "BROWSE_COLUMN_LIMIT"
                      ? reply.error.message
                      : "Could not load rows. The table may have changed, or a value exceeds browsing limits. Refresh to retry.",
                },
        });
      });
    return () => {
      active = false;
    };
  }, [sessionId, generation, signature, reload, key]);
  return result?.key === key ? result.state : ({ kind: "loading" } satisfies PageState);
}
