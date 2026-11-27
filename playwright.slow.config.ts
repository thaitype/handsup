import { defineConfig } from "@playwright/test";
import app from "./playwright.app.config.ts";

/**
 * The checks that wait for real polling cycles (AC27 to AC29). Several minutes, so they are
 * kept out of the quick runs and run by `pnpm gate`.
 */
export default defineConfig(app, {
  testDir: "./e2e/slow",
  timeout: 240_000,
  fullyParallel: true,
  workers: 3,
});
