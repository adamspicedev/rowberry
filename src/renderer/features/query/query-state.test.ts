import { expect, test, vi } from "vitest";
import { loadDrafts, saveDrafts } from "./query-state";
test("connection switches retain editor text even when browser persistence quota is full", () => {
  vi.stubGlobal("localStorage", {
    setItem() {
      throw new Error("Quota exceeded");
    },
    getItem() {
      return null;
    },
  });
  try {
    expect(saveDrafts(["SELECT 42", "BEGIN"])).toBe(false);
    expect(loadDrafts()).toEqual(["SELECT 42", "BEGIN"]);
  } finally {
    vi.unstubAllGlobals();
  }
});
