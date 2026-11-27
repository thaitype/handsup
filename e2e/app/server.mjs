// Starts the real app under `vite dev` for the browser tests, with test values instead of a
// developer's .dev.vars and a fresh local D1 that has the migrations applied.
// Usage (Playwright webServer): node e2e/app/server.mjs
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { experimental_readRawConfig } from "wrangler";

export const PORT = 5199;
export const INSTRUCTOR = "e2e-teacher@example.test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = `${root}node_modules/.cache/handsup-e2e`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const { rawConfig } = experimental_readRawConfig({ config: `${root}wrangler.jsonc` });
const { $schema: _, ...config } = rawConfig;
writeFileSync(
  `${dir}/wrangler.json`,
  JSON.stringify({
    ...config,
    main: `${root}${config.main}`,
    d1_databases: config.d1_databases.map((db) => ({ ...db, migrations_dir: `${root}${db.migrations_dir}` })),
    vars: {
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      GOOGLE_CLIENT_ID: "e2e-google-client-id",
      GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
      INSTRUCTOR_EMAILS: INSTRUCTOR,
    },
  }),
);

const wrangler = `${root}node_modules/.bin/wrangler`;
// Fails loudly: the tests are meaningless against a database without the tables.
execFileSync(wrangler, ["d1", "migrations", "apply", "DB", "--local", "--config", `${dir}/wrangler.json`, "--persist-to", `${dir}/state`], {
  stdio: "inherit",
  env: { ...process.env, CI: "1" },
});

const vite = spawn(`${root}node_modules/.bin/vite`, ["dev", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, HANDSUP_E2E_DIR: dir },
});
const stop = () => vite.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
vite.on("exit", (code) => process.exit(code ?? 0));
