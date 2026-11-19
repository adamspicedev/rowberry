import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: [
    "**/browse.spec.ts",
    "**/schema-browser.spec.ts",
    "**/connection-test.spec.ts",
    "**/connections.spec.ts",
    "**/recovery.spec.ts",
    "**/recovery-toggle.spec.ts",
    "**/security.spec.ts",
    "**/query.spec.ts",
    "**/save.spec.ts",
    "**/json.spec.ts",
  ],
  workers: 1,
  timeout: 60000,
  use: { trace: "retain-on-failure" },
});
