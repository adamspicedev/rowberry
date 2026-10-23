import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: [
    "**/schema-browser.spec.ts",
    "**/connection-test.spec.ts",
    "**/sessions.spec.ts",
    "**/browse.spec.ts",
    "**/query.spec.ts",
    "**/json.spec.ts",
    "**/json-viewer.spec.ts",
    "**/save.spec.ts",
  ],
});
