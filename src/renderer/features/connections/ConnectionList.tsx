import { useEffect, useRef, useState } from "react";
import { RequestIdSchema, type ConnectionProfile } from "../../../shared/protocol";
import { Button } from "../../components/ui/button";
import { ConnectionDialog } from "./ConnectionDialog";
export function ConnectionList() {
  const connectRequest = useRef(0);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [secureStorage, setSecureStorage] = useState(false);
  const [dialog, setDialog] = useState<"new" | ConnectionProfile | null>(null);
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
    await refresh("Connection and its password deleted.");
  }
  return (
    <>
      <label htmlFor="schema-search" className="sr-only">
        Search connections and schemas
      </label>
      <input
        id="schema-search"
        placeholder="Search connections…"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="section-label">
        CONNECTIONS <span>{profiles.length}</span>
      </div>
      <Button onClick={() => setDialog("new")}>New connection</Button>
      {profiles.length === 0 && <p className="sidebar-empty">No saved connections</p>}
      <ul className="connection-list">
        {profiles
          .filter((profile) => profile.name.toLowerCase().includes(search.toLowerCase()))
          .map((profile) => (
            <li key={profile.id}>
              <strong>
                <span style={{ color: profile.environmentColor }} aria-hidden="true">
                  ●{" "}
                </span>
                {profile.name}
              </strong>
              <small>
                {profile.host}:{profile.port} / {profile.database}
              </small>
              <div>
                <Button
                  variant="ghost"
                  aria-label={`Edit ${profile.name}`}
                  onClick={() => setDialog(profile)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Connect ${profile.name}`}
                  onClick={async () => {
                    const selection = ++connectRequest.current;
                    setMessage("Connecting…");
                    const reply = await window.dbapp.request({
                      kind: "connections.connect",
                      requestId: requestId(),
                      id: profile.id,
                    });
                    if (selection === connectRequest.current)
                      setMessage(reply.ok ? "Connected." : reply.error.message);
                  }}
                >
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Delete ${profile.name}`}
                  onClick={() => setDeleting(profile)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
      </ul>
      {message && <output className="connection-message">{message}</output>}
      {dialog && (
        <ConnectionDialog
          profile={dialog === "new" ? undefined : dialog}
          secureStorage={secureStorage}
          onSaved={refresh}
          onClose={() => setDialog(null)}
        />
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
