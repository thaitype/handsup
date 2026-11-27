import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/spikes",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
