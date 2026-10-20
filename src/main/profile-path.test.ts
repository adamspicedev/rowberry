import { expect, test } from "vitest";
import path from "node:path";
import { profilePath } from "./profile-path";
test("product renaming preserves the original dbapp profile under native appData", () => {
  const appData = path.resolve("temporary-native-app-data");
  expect(profilePath(appData, "")).toBe(path.join(appData, "dbapp"));
  expect(profilePath(appData, "isolated-test-profile")).toBe(path.resolve("isolated-test-profile"));
});
