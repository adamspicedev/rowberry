import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: "**/sessions.spec.ts",
  workers: 1,
  timeout: 30000,
  use: { trace: "retain-on-failure" },
});
