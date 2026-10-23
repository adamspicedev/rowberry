import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.WEB_BASE_URL ?? "http://127.0.0.1:4178", trace: "retain-on-failure" },
  webServer: process.env.WEB_BASE_URL
    ? undefined
    : {
        command: "bun run start",
        port: 4178,
        env: { PORT: "4178", HOST: "127.0.0.1" },
        reuseExistingServer: !process.env.CI,
      },
});
