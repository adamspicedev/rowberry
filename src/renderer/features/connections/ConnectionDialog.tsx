import { useRef, useState, type FormEvent, type CSSProperties } from "react";
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
  onDirty,
  onBusy,
  onConnect,
  locked = false,
  onDelete,
}: {
  profile?: ConnectionProfile;
  secureStorage: boolean;
  onSaved: (message: string, profile: ConnectionProfile) => Promise<void>;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onConnect: (profile: ConnectionProfile) => Promise<void>;
  locked?: boolean;
  onDelete?: () => void;
}) {
  const profileId = useRef(profile?.id ?? ConnectionIdSchema.parse(crypto.randomUUID()));
  const password = useRef<HTMLInputElement>(null);
  const [tls, setTls] = useState(profile?.tls.kind ?? "verify-full");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [color, setColor] = useState(profile?.environmentColor ?? "#7c3aed");
  const requestId = () => RequestIdSchema.parse(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || busy) return;
    const connectAfterSave =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "connect";
    const form = event.currentTarget;
    // This input is deliberately uncontrolled and has no name, so FormData never contains it.
    let secret = password.current?.value ?? "";
    if (password.current) password.current.value = "";
    const fields = new FormData(form);
    setBusy(true);
    onBusy(true);
    setError("");
    let savedProfile: ConnectionProfile | undefined;
    try {
      const id = profileId.current;
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
      let message = "Connection saved. Select Connect to open a session.";
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
      onDirty(false);
      await onSaved(message, validated.data);
      savedProfile = validated.data;
    } catch {
      setError("The connection could not be saved. Enter the password again to retry.");
    } finally {
      secret = "";
      setBusy(false);
      onBusy(false);
    }
    // The save scope is finished before a connection attempt can outlive this editor.
    if (connectAfterSave && savedProfile) await onConnect(savedProfile);
  }
  const verified = profile?.tls.kind === "verify-full" ? profile.tls : undefined;
  return (
    <section
      className="connection-editor"
      style={{ "--profile-color": color } as CSSProperties}
      aria-labelledby="connection-title"
    >
      <div className="connection-editor-heading">
        <div>
          <span className="connection-engine">POSTGRESQL</span>
          <h1 id="connection-title">{profile ? profile.name : "New connection"}</h1>
          {locked && <p>Disconnect to edit this connection.</p>}
        </div>
        {locked && <span className="badge">Session active</span>}
      </div>
      <form onSubmit={submit} onChange={() => onDirty(true)}>
        <fieldset className="connection-fields" disabled={locked || busy}>
          <div className="profile-identity-row">
            <label>
              Name
              <input name="name" defaultValue={profile?.name ?? ""} required maxLength={80} />
            </label>
            <label>
              Database
              <input
                name="database"
                defaultValue={profile?.database ?? "postgres"}
                required
                maxLength={128}
              />
            </label>
          </div>
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
          <div className="credentials-row">
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
              <span className="password-control">
                <input
                  ref={password}
                  aria-label="Password"
                  type={visiblePassword ? "text" : "password"}
                  autoComplete="off"
                  maxLength={4096}
                  aria-describedby="password-help"
                />
                <button
                  type="button"
                  aria-label={visiblePassword ? "Hide password" : "Show password"}
                  onClick={() => setVisiblePassword(!visiblePassword)}
                >
                  {visiblePassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          </div>
          <p id="password-help">
            {secureStorage
              ? "Leave blank to keep the saved password."
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
          <details className="ssl-settings" open={tls !== "verify-full" || undefined}>
            <summary>
              SSL settings{" "}
              <span>
                {tls === "verify-full"
                  ? "Verify certificate"
                  : tls === "require"
                    ? "Encrypted · unverified"
                    : "Unencrypted"}
              </span>
            </summary>
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
          </details>
          <div className="connection-colors">
            <span>Connection colour</span>
            <fieldset className="color-swatches" aria-label="Connection colour">
              {(
                [
                  ["Purple", "#7c3aed"],
                  ["Mint", "#35a881"],
                  ["Blue", "#3985d6"],
                  ["Rose", "#d45686"],
                  ["Amber", "#bd7b20"],
                  ["Slate", "#64748b"],
                ] as const
              ).map(([name, value]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={name}
                  aria-pressed={color === value}
                  style={{ background: value }}
                  onClick={() => {
                    setColor(value);
                    onDirty(true);
                  }}
                />
              ))}
              <input
                aria-label="Custom environment colour"
                name="color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </fieldset>
          </div>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="connection-editor-actions">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy || locked}
              onClick={onDelete}
              aria-label={`Delete ${profile?.name}`}
            >
              Delete
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="ghost" disabled={busy || locked}>
            {busy ? "Saving…" : "Save connection"}
          </Button>
          <Button type="submit" value="connect" disabled={busy || locked}>
            Save &amp; connect
          </Button>
        </div>
      </form>
    </section>
  );
}
