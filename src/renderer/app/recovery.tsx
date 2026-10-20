import { useEffect, useRef, useState } from "react";
import {
  canReadWorkspace,
  canRetryLegacyMigration,
  canRetryWorkspaceSave,
  retryLegacyMigration,
  flushWorkspace,
  loadWorkspace,
  subscribeWorkspace,
  updateWorkspace,
  workspaceError,
  workspaceState,
} from "./workspace";
export function RecoveryControls() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [, render] = useState(0);
  const [open, setOpen] = useState(() => workspaceState().drafts.length > 0);
  useEffect(() => subscribeWorkspace(() => render((value) => value + 1)), []);
  const state = workspaceState();
  const hasDrafts = state.drafts.length > 0;
  useEffect(() => {
    if (open && hasDrafts) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open, hasDrafts]);
  return (
    <section aria-label="Workspace recovery" data-dirty={state.drafts.length > 0}>
      <label>
        <input
          type="checkbox"
          checked={state.recoveryEnabled}
          onChange={(event) => {
            updateWorkspace({ recoveryEnabled: event.target.checked });
            void flushWorkspace();
          }}
        />
        Recover drafts on this device
      </label>
      {workspaceError() && (
        <div role="alert">
          {workspaceError()}{" "}
          {canRetryLegacyMigration() && (
            <button onClick={() => void retryLegacyMigration()}>Retry legacy SQL migration</button>
          )}
          {canReadWorkspace() && (
            <button onClick={() => void loadWorkspace()}>Retry reading recovery</button>
          )}
          {canRetryWorkspaceSave() && (
            <button onClick={() => void flushWorkspace()}>Retry saving workspace</button>
          )}
        </div>
      )}
      {!!state.drafts.length && (
        <button onClick={() => setOpen(true)}>
          Review recovered drafts ({state.drafts.length})
        </button>
      )}
      <dialog
        ref={dialog}
        className="recovery-dialog"
        aria-label="Recovered drafts"
        onClose={() => setOpen(false)}
      >
        <h2>Recovered local copies</h2>
        <p>
          These copies have no database save target. Reopen the current value and compare it before
          applying changes. Invalid JSON is preserved verbatim.
        </p>
        {state.drafts.map((draft) => (
          <label key={draft.id}>
            {draft.label}
            <textarea aria-label={`Recovered ${draft.kind} draft`} value={draft.text} readOnly />
          </label>
        ))}
        <button onClick={() => setOpen(false)}>Keep local copies</button>
        <button
          onClick={() => {
            updateWorkspace({ drafts: [] });
            void flushWorkspace();
          }}
        >
          Discard recovered copies
        </button>
      </dialog>
    </section>
  );
}
