import type { AppEvent } from "../../shared/protocol";
export type SessionState = Extract<AppEvent, { kind: "sessions.state" }>;
export function acceptSessionEvent(
  current: SessionState | null,
  event: AppEvent,
): SessionState | null {
  if (event.kind !== "sessions.state") return current;
  if (
    current &&
    (event.generation < current.generation ||
      (event.generation === current.generation && event.sessionId !== current.sessionId))
  )
    return current;
  return event;
}
