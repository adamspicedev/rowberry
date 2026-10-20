import { expect, test } from "vitest";
import { NativeCredentialStore } from "./credentials";
test("availability coalesces concurrent probes and cleans a partly failed write", async () => {
  class FailedProbe extends NativeCredentialStore {
    writes = 0;
    deletes = 0;
    override async set(): Promise<void> {
      this.writes++;
      throw new Error("vault failed after writing");
    }
    override async delete(): Promise<void> {
      this.deletes++;
    }
  }
  const store = new FailedProbe();
  expect(await Promise.all([store.available(), store.available(), store.available()])).toEqual([
    false,
    false,
    false,
  ]);
  expect(store.writes).toBe(1);
  expect(store.deletes).toBe(1);
});
test("an undeletable availability probe does not advertise a usable vault", async () => {
  class LockedProbe extends NativeCredentialStore {
    override async set(): Promise<void> {}
    override async delete(): Promise<void> {
      throw new Error("locked vault");
    }
  }
  expect(await new LockedProbe().available()).toBe(false);
});
