import { defineConfig, devices } from "@playwright/test";

/** Browser tests against the real app under `vite dev` (e2e/app/server.mjs). */
export default defineConfig({
  testDir: "./e2e/app",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:5199" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node e2e/app/server.mjs",
    url: "http://localhost:5199/api/me",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
