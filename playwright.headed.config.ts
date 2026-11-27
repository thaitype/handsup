import { defineConfig, devices } from "@playwright/test";

/** Mild's step 12 window (e2e/headed). It uses the app already running under `pnpm dev`. */
export default defineConfig({
  testDir: "./e2e/headed",
  workers: 1,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], headless: false, viewport: null } }],
});
