import { useSyncExternalStore } from "react";
import { subscribeWorkspace, workspaceState } from "./workspace";

const recoveryEnabled = () => workspaceState().recoveryEnabled;

// Editors own their live text while recovery is off. Observe only the setting so
// re-enabling snapshots mounted editors without reacting to every recovery write.
export function useRecoveryEnabled() {
  return useSyncExternalStore(subscribeWorkspace, recoveryEnabled);
}
