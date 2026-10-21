import { createPortal } from "react-dom";
import { discardLiveJsonDrafts } from "../../app/workspace";
import { useEffect, useRef, useState } from "react";
import { RequestIdSchema, type ConnectionProfile } from "../../../shared/protocol";
import { Button } from "../../components/ui/button";
import { ConnectionDialog } from "./ConnectionDialog";
export function ConnectionList({
  activeId,
  connecting = false,
  editorHost,
  onShow,
  onConnected,
  resetKey,
  onDirty,
  onBusy,
}: {
  activeId?: string;
  connecting?: boolean;
  editorHost: HTMLElement | null;
  onShow: () => void;
  onConnected: () => void;
  resetKey: number;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}) {
  const connectRequest = useRef(0);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [secureStorage, setSecureStorage] = useState(false);
  const [dialog, setDialog] = useState<"new" | ConnectionProfile | null>(null);
  const [revision, setRevision] = useState(0);
  const dirty = useRef(false);
  const busy = useRef(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<ConnectionProfile | null>(null);
  const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
  async function refresh(message = "") {
    const all: ConnectionProfile[] = [];
    let offset: number | null = 0;
    do {
      const reply = await window.dbapp.request({
        kind: "connections.list",
        requestId: requestId(),
        offset,
      });
      if (!reply.ok) {
        setMessage(reply.error.message);
        return;
      }
      if (reply.kind !== "connections.list") return;
      all.push(...reply.data.profiles);
      offset = reply.data.nextOffset;
      setSecureStorage(reply.data.secureStorage);
    } while (offset !== null);
    setProfiles(all);
    setMessage(message);
  }
  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, []);
  useEffect(() => {
    dirty.current = false;
  }, [resetKey]);
  function select(next: "new" | ConnectionProfile | null) {
    if (busy.current) return;
    if (dirty.current && !window.confirm("Discard unsaved connection changes?")) return;
    dirty.current = false;
    onDirty(false);
    setDialog(next);
    setRevision((current) => current + 1);
    setMessage("");
    onShow();
  }
  async function connect(profile: ConnectionProfile) {
    if (document.querySelector('[data-saving="true"]')) return;
    if (
      document.querySelector('[data-dirty="true"]') &&
      !window.confirm("Discard unsaved table and JSON drafts before opening another connection?")
    )
      return;
    discardLiveJsonDrafts();
    onShow();
    const selection = ++connectRequest.current;
    setMessage("Connecting…");
    const reply = await window.dbapp.request({
      kind: "connections.connect",
      requestId: requestId(),
      id: profile.id,
    });
    if (selection === connectRequest.current) {
      setMessage(reply.ok ? "Connected." : reply.error.message);
      if (reply.ok) onConnected();
    }
  }
  async function remove() {
    if (!deleting) return;
    const reply = await window.dbapp.request({
      kind: "connections.delete",
      requestId: requestId(),
      id: deleting.id,
    });
    if (!reply.ok) {
      setMessage(
        "Connection was retained because credential deletion failed. Unlock the OS credential store and retry.",
      );
      setDeleting(null);
      return;
    }
    setDeleting(null);
    setDialog(null);
    dirty.current = false;
    onDirty(false);
    await refresh("Connection and its password deleted.");
  }
  return (
    <>
      <Button
        className="new-connection-button"
        onClick={() => select("new")}
        aria-label="New connection"
      >
        + New connection
      </Button>
      <label htmlFor="schema-search" className="sr-only">
        Search connections
      </label>
      <input
        id="schema-search"
        placeholder="Filter connections…"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="section-label">
        SAVED CONNECTIONS <span>{profiles.length}</span>
      </div>
      {profiles.length === 0 && <p className="sidebar-empty">No saved connections</p>}
      <ul className="connection-list">
        {profiles
          .filter((profile) =>
            [profile.name, profile.host, profile.database].some((value) =>
              value.toLowerCase().includes(search.toLowerCase()),
            ),
          )
          .map((profile) => (
            <li
              key={profile.id}
              className={
                dialog !== "new" && dialog?.id === profile.id ? "selected-connection" : undefined
              }
            >
              <button
                className="connection-select"
                style={{ borderLeftColor: profile.environmentColor }}
                aria-label={`Select ${profile.name}`}
                aria-describedby={`connection-address-${profile.id}${activeId === profile.id ? ` connection-status-${profile.id}` : ""}`}
                aria-current={dialog !== "new" && dialog?.id === profile.id ? "true" : undefined}
                onClick={() => select(profile)}
              >
                <strong>{profile.name}</strong>
                <small
                  id={`connection-address-${profile.id}`}
                  title={`${profile.host}:${profile.port} / ${profile.database}`}
                >
                  {profile.host}:{profile.port} / {profile.database}
                </small>
                {activeId === profile.id && (
                  <span id={`connection-status-${profile.id}`} className="connection-session-label">
                    {connecting ? "Connecting…" : "Connected"}
                  </span>
                )}
              </button>
              <Button
                className="connection-quick-connect"
                variant="ghost"
                aria-label={`Connect ${profile.name}`}
                title={`Connect ${profile.name}`}
                disabled={connecting}
                onClick={() => {
                  if (busy.current) return;
                  if (
                    dirty.current &&
                    !window.confirm("Discard unsaved connection changes before connecting?")
                  )
                    return;
                  dirty.current = false;
                  onDirty(false);
                  setRevision((current) => current + 1);
                  void connect(profile);
                }}
              >
                ↗
              </Button>
            </li>
          ))}
      </ul>
      {profiles.length > 0 &&
        !profiles.some((profile) =>
          [profile.name, profile.host, profile.database].some((value) =>
            value.toLowerCase().includes(search.toLowerCase()),
          ),
        ) && <p className="sidebar-empty">No matching connections</p>}
      {editorHost &&
        createPortal(
          <>
            {message && <output className="connection-message">{message}</output>}
            {dialog ? (
              <ConnectionDialog
                key={`${dialog === "new" ? "new" : dialog.id}-${revision}-${resetKey}`}
                profile={dialog === "new" ? undefined : dialog}
                secureStorage={secureStorage}
                locked={dialog !== "new" && activeId === dialog.id}
                onDirty={(value) => {
                  dirty.current = value;
                  onDirty(value);
                }}
                onBusy={(value) => {
                  busy.current = value;
                  onBusy(value);
                }}
                onSaved={async (message, profile) => {
                  await refresh(message);
                  setDialog(profile);
                  onDirty(false);
                }}
                onConnect={connect}
                onClose={() => {
                  select(dialog === "new" ? null : dialog);
                  if (!dirty.current) onDirty(false);
                }}
                onDelete={
                  dialog === "new"
                    ? undefined
                    : () => {
                        if (
                          !dirty.current ||
                          window.confirm(
                            "Discard unsaved connection changes and delete this connection?",
                          )
                        )
                          setDeleting(dialog);
                      }
                }
              />
            ) : (
              <section className="connection-manager-empty">
                <span className="connection-engine">POSTGRESQL</span>
                <h1>
                  Your databases.
                  <br />
                  In a good place.
                </h1>
                <p>Select a saved connection, or add your first one.</p>
                <Button onClick={() => select("new")}>Create a connection</Button>
              </section>
            )}
          </>,
          editorHost,
        )}
      {deleting && (
        <div className="dialog-backdrop">
          <dialog
            className="connection-dialog"
            ref={(node) => {
              if (node && !node.open) node.showModal();
            }}
            onCancel={() => setDeleting(null)}
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Delete {deleting.name}?</h2>
            <p>This removes the saved profile and its OS credential.</p>
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button onClick={() => void remove()}>Delete connection</Button>
            </div>
          </dialog>
        </div>
      )}
    </>
  );
}
