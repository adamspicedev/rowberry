import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  // Live JSON workflows are opt-in by explicit file selection or the PostgreSQL suite.
  testIgnore: [
    "**/sessions.spec.ts",
    "**/browse.spec.ts",
    "**/query.spec.ts",
    ...(process.argv.some((argument) => argument.endsWith("json.spec.ts"))
      ? []
      : ["**/json.spec.ts"]),
  ],
  workers: 1,
  timeout: 30000,
  use: { trace: "retain-on-failure" },
});
