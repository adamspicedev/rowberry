import { randomUUID } from "node:crypto";
export interface CredentialStore {
  get(id: string): Promise<string | null>;
  set(id: string, secret: string): Promise<void>;
  delete(id: string): Promise<void>;
  available(): Promise<boolean>;
}
// Loading failure is treated exactly like an unavailable/locked OS vault.
export class NativeCredentialStore implements CredentialStore {
  constructor(private readonly service = "org.dbapp.desktop.connections") {}
  private async entry(id: string) {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    return new AsyncEntry(this.service, id, { linux: { store: "secret-service" } });
  }
  async get(id: string): Promise<string | null> {
    try {
      return await (await this.entry(id)).getPassword();
    } catch {
      throw new Error("Credential operation failed.");
    }
  }
  async set(id: string, secret: string): Promise<void> {
    try {
      await (await this.entry(id)).setPassword(secret);
    } catch {
      throw new Error("Credential operation failed.");
    }
  }
  async delete(id: string): Promise<void> {
    try {
      await (await this.entry(id)).deletePassword();
    } catch {
      throw new Error("Credential operation failed.");
    }
  }
  async available(): Promise<boolean> {
    const id = `probe-${randomUUID()}`;
    try {
      await this.set(id, "availability-check");
      await this.delete(id);
      return true;
    } catch {
      return false;
    }
  }
}
