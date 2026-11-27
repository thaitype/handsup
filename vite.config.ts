import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";

// The browser tests run the app from a generated config with test values and their own
// local state (e2e/app/server.mjs). Unset, this is wrangler.jsonc and .wrangler/state as always.
const e2e = process.env.HANDSUP_E2E_DIR;

const config = {
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(e2e ? { configPath: `${e2e}/wrangler.json`, persistState: { path: `${e2e}/state` } } : {}),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
} satisfies UserConfig;

export default defineConfig(({ command }) => {
  // A build from the e2e config would bake its secret and instructor list into
  // dist/handsup/wrangler.json as plain vars (review round 9). Only `vite dev` may use it.
  if (e2e && command === "build") {
    throw new Error("HANDSUP_E2E_DIR is set: refusing to build with the e2e config and its test values");
  }
  return config;
});
