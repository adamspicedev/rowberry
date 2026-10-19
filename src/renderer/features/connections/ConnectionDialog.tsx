import { useRef, useState, type FormEvent } from "react";
import {
  ConnectionIdSchema,
  ConnectionProfileSchema,
  RequestIdSchema,
  type ConnectionProfile,
} from "../../../shared/protocol";
import { Button } from "../../components/ui/button";
export function ConnectionDialog({
  profile,
  secureStorage,
  onSaved,
  onClose,
}: {
  profile?: ConnectionProfile;
  secureStorage: boolean;
  onSaved: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const password = useRef<HTMLInputElement>(null);
  const [tls, setTls] = useState(profile?.tls.kind ?? "verify-full");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // This input is deliberately uncontrolled and has no name, so FormData never contains it.
    let secret = password.current?.value ?? "";
    if (password.current) password.current.value = "";
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const id = profile?.id ?? ConnectionIdSchema.parse(crypto.randomUUID());
      const caPath = fields.get("caPath");
      const certPath = fields.get("certPath");
      const keyPath = fields.get("keyPath");
      const validated = ConnectionProfileSchema.safeParse({
        id,
        name: fields.get("name"),
        host: fields.get("host"),
        port: Number(fields.get("port")),
        database: fields.get("database"),
        user: fields.get("user"),
        environmentColor: fields.get("color"),
        tls:
          tls === "verify-full"
            ? {
                kind: tls,
                ...(caPath ? { caPath } : {}),
                ...(certPath || keyPath ? { client: { certPath, keyPath } } : {}),
              }
            : { kind: tls, acknowledged: fields.get("acknowledged") === "on" },
      });
      if (!validated.success) {
        setError(
          "Check the connection fields and TLS acknowledgement. Certificate and key paths must be supplied together.",
        );
        return;
      }
      const saved = await window.dbapp.request({
        kind: "connections.save",
        requestId: requestId(),
        profile: validated.data,
      });
      if (!saved.ok) {
        setError(saved.error.message);
        return;
      }
      let message = "Connection saved. Database connectivity is not available yet.";
      if (secret !== "") {
        const pending = window.dbapp.request({
          kind: "connections.submitSecret",
          requestId: requestId(),
          id,
          secret,
          persist: fields.get("persist") === "on",
        });
        secret = "";
        const reply = await pending;
        if (!reply.ok) {
          setError(
            "Connection metadata saved, but the password could not be stored. Enter it again to retry.",
          );
          return;
        }
        if (reply.kind === "connections.submitSecret")
          message =
            reply.data.storage === "secure"
              ? "Connection saved. Password stored in the OS credential store."
              : "Connection saved. Password is session-only and will be forgotten when the app quits.";
      }
      await onSaved(message);
      onClose();
    } catch {
      setError("The connection could not be saved. Enter the password again to retry.");
    } finally {
      secret = "";
      setBusy(false);
    }
  }
  const verified = profile?.tls.kind === "verify-full" ? profile.tls : undefined;
  return (
    <div className="dialog-backdrop">
      <dialog
        ref={(node) => {
          if (node && !node.open) node.showModal();
        }}
        onCancel={() => {
          if (password.current) password.current.value = "";
          onClose();
        }}
        aria-labelledby="connection-title"
        className="connection-dialog"
      >
        <h2 id="connection-title">{profile ? "Edit connection" : "New connection"}</h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input
              name="name"
              autoFocus
              defaultValue={profile?.name ?? ""}
              required
              maxLength={80}
            />
          </label>
          <div className="form-row">
            <label>
              Host
              <input
                name="host"
                defaultValue={profile?.host ?? "localhost"}
                required
                maxLength={253}
              />
            </label>
            <label>
              Port
              <input
                name="port"
                type="number"
                defaultValue={profile?.port ?? 5432}
                min={1}
                max={65535}
                required
              />
            </label>
          </div>
          <label>
            Database
            <input
              name="database"
              defaultValue={profile?.database ?? "postgres"}
              required
              maxLength={128}
            />
          </label>
          <label>
            User
            <input
              name="user"
              defaultValue={profile?.user ?? "postgres"}
              required
              maxLength={128}
            />
          </label>
          <label>
            Password
            <input
              ref={password}
              type="password"
              autoComplete="off"
              maxLength={4096}
              aria-describedby="password-help"
            />
          </label>
          <p id="password-help">
            {secureStorage
              ? "Leave blank to keep the existing password. Passwords are never returned to this form."
              : "OS credential storage is unavailable. New passwords are kept only until the app quits."}
          </p>
          <label className="checkbox-label">
            <input
              name="persist"
              type="checkbox"
              defaultChecked={secureStorage}
              disabled={!secureStorage}
            />
            Save password in OS credential store
          </label>
          <label>
            TLS
            <select
              aria-label="TLS"
              value={tls}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "verify-full" || value === "require" || value === "disable")
                  setTls(value);
              }}
            >
              <option value="verify-full">Verify server certificate (recommended)</option>
              <option value="require">Encrypt without certificate verification</option>
              <option value="disable">Unencrypted connection</option>
            </select>
          </label>
          {tls === "verify-full" ? (
            <fieldset>
              <legend>Optional certificate paths</legend>
              <label>
                CA certificate
                <input name="caPath" maxLength={512} defaultValue={verified?.caPath ?? ""} />
              </label>
              <label>
                Client certificate
                <input
                  name="certPath"
                  maxLength={512}
                  defaultValue={verified?.client?.certPath ?? ""}
                />
              </label>
              <label>
                Client private key
                <input
                  name="keyPath"
                  maxLength={512}
                  defaultValue={verified?.client?.keyPath ?? ""}
                />
              </label>
            </fieldset>
          ) : (
            <div className="tls-warning">
              <p>
                {tls === "disable"
                  ? "Traffic, including your password and queries, can be read or changed on the network."
                  : "Encryption without certificate verification cannot prove the server's identity and permits impersonation."}
              </p>
              <label className="checkbox-label">
                <input
                  key={tls}
                  name="acknowledged"
                  type="checkbox"
                  required
                  defaultChecked={profile?.tls.kind === tls}
                />
                I understand this connection's risk
              </label>
            </div>
          )}
          <label>
            Environment colour
            <input
              name="color"
              type="color"
              defaultValue={profile?.environmentColor ?? "#7c3aed"}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (password.current) password.current.value = "";
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save connection"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
