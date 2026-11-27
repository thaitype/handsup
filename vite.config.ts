import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The browser tests run the app from a generated config with test values and their own
// local state (e2e/app/server.mjs). Unset, this is wrangler.jsonc and .wrangler/state as always.
const e2e = process.env.HANDSUP_E2E_DIR;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(e2e ? { configPath: `${e2e}/wrangler.json`, persistState: { path: `${e2e}/state` } } : {}),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
});
