import { MAX_MESSAGE_BYTES, type ConnectionId, type ConnectionProfile } from "../shared/protocol";
import type { ConnectionStore } from "./store";
import type { CredentialStore } from "./credentials";
export class ConnectionService {
  private readonly sessionSecrets = new Map<ConnectionId, string>();
  // Main-process only. Never expose resolveSecret through IPC.
  constructor(
    private readonly store: ConnectionStore,
    private readonly credentials: CredentialStore,
  ) {}
  async list(offset = 0) {
    const candidates = this.store.list(offset);
    const profiles: ConnectionProfile[] = [];
    let bytes = 0;
    for (const profile of candidates) {
      const size = Buffer.byteLength(JSON.stringify(profile), "utf8") + 1;
      if (bytes + size > MAX_MESSAGE_BYTES - 1024) break;
      profiles.push(profile);
      bytes += size;
    }
    return {
      profiles,
      nextOffset:
        candidates.length === 20 || profiles.length < candidates.length
          ? offset + profiles.length
          : null,
      secureStorage: await this.credentials.available(),
    };
  }
  async save(profile: unknown): Promise<ConnectionProfile> {
    return this.store.save(profile);
  }
  async submitSecret(
    id: ConnectionId,
    secret: string,
    persist: boolean,
  ): Promise<{ storage: "secure" | "session" }> {
    if (!this.store.has(id)) throw new Error("Connection does not exist.");
    if (persist && (await this.credentials.available())) {
      try {
        this.store.markCredential(id, false);
        await this.credentials.set(id, secret);
        this.store.markCredential(id, true);
        this.sessionSecrets.delete(id);
        return { storage: "secure" };
      } catch {
        this.sessionSecrets.set(id, secret);
        return { storage: "session" };
      }
    }
    this.store.markCredential(id, false, this.store.credentialState(id).referenced);
    this.sessionSecrets.set(id, secret);
    return { storage: "session" };
  }
  profile(id: ConnectionId): ConnectionProfile {
    return this.store.get(id);
  }
  async resolveSecret(id: ConnectionId): Promise<string | null> {
    if (!this.store.has(id)) return null;
    if (this.sessionSecrets.has(id)) return this.sessionSecrets.get(id) ?? null;
    if (!this.store.credentialState(id).enabled) return null;
    try {
      return await this.credentials.get(id);
    } catch {
      throw new Error("Credential operation failed.");
    }
  }
  async delete(id: ConnectionId): Promise<void> {
    if (!this.store.has(id)) return;
    try {
      if (this.store.credentialState(id).referenced) await this.credentials.delete(id);
    } catch {
      throw new Error("Credential operation failed.");
    }
    this.sessionSecrets.delete(id);
    this.store.delete(id);
  }
}
