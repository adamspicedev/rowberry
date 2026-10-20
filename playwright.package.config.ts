import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: [
    "**/connections.spec.ts",
    "**/security.spec.ts",
    "**/query.spec.ts",
    "**/save.spec.ts",
    "**/json.spec.ts",
  ],
  workers: 1,
  timeout: 60000,
  use: { trace: "retain-on-failure" },
});
