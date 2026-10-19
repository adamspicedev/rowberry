import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { NativeCredentialStore } from "../../src/main/credentials";
// Explicit opt-in: this writes and removes a disposable real OS vault entry.
test.skipIf(process.env.DBAPP_NATIVE_CREDENTIAL_TEST !== "1")(
  "native OS vault set/get/delete round trip",
  async () => {
    const store = new NativeCredentialStore("org.dbapp.desktop.native-test");
    const id = randomUUID();
    const secret = randomUUID();
    expect(await store.available()).toBe(true);
    try {
      await store.set(id, secret);
      expect(await store.get(id)).toBe(secret);
      const restarted = new NativeCredentialStore("org.dbapp.desktop.native-test");
      expect(await restarted.get(id)).toBe(secret);
    } finally {
      await store.delete(id);
    }
    expect(await store.get(id)).toBeNull();
  },
  15000,
);
