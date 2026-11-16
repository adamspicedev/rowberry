import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  // Live editing workflows are opt-in by explicit file selection or the PostgreSQL suite.
  testIgnore: [
    "**/schema-browser.spec.ts",
    "**/connection-test.spec.ts",
    "**/sessions.spec.ts",
    "**/browse.spec.ts",
    "**/query.spec.ts",
    ...(process.argv.some(
      (argument) =>
        argument.endsWith("json.spec.ts") ||
        argument.endsWith("save.spec.ts") ||
        argument.endsWith("recovery-toggle.spec.ts"),
    )
      ? []
      : ["**/json.spec.ts", "**/save.spec.ts", "**/recovery-toggle.spec.ts"]),
    "**/json-viewer.spec.ts",
  ],
  workers: 1,
  timeout: 30000,
  use: { trace: "retain-on-failure" },
});
