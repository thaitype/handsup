import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { experimental_readRawConfig } from "wrangler";
import { buildInfo } from "./scripts/build-info.mjs";

/** Test values only. Every app variable is set here so a developer's .dev.vars cannot leak in. */
const baseVars = {
  BETTER_AUTH_SECRET: "test-only-secret-0123456789-abcdefghijklmnop",
  BETTER_AUTH_URL: "http://localhost:5173",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  INSTRUCTOR_EMAILS: " Teacher@Example.test , second.teacher@example.test",
};

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Wrangler loads the .dev.vars that sits next to its config file, and a value there would
 * stand in for a variable a test expects to be unset. So tests use a generated copy of
 * wrangler.jsonc in a directory that has no .dev.vars.
 */
function isolatedWranglerConfig(): string {
  const { rawConfig } = experimental_readRawConfig({ config: path("./wrangler.jsonc") });
  const directory = path("./node_modules/.cache/handsup-test");
  mkdirSync(directory, { recursive: true });
  const target = `${directory}/wrangler.json`;
  const { $schema: _, ...config } = rawConfig;
  writeFileSync(target, JSON.stringify({ ...config, main: path(`./${config.main}`) }));
  return target;
}

/** Read here with git directly, so the version test does not trust build-info.mjs. */
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path("./migrations"));
  const testConfigPath = isolatedWranglerConfig();
  const project = (name: string, include: string[], extraVars: Record<string, string> = {}) => ({
    plugins: [
      cloudflareTest({
        wrangler: { configPath: testConfigPath },
        miniflare: {
          bindings: { ...baseVars, ...extraVars, TEST_MIGRATIONS: migrations, TEST_GIT_HEAD: gitHead },
        },
      }),
    ],
    test: { name, include, setupFiles: ["./test/support/apply-migrations.ts"] },
    define: { __HANDSUP_BUILD__: JSON.stringify(buildInfo({ requireGit: true })) },
  });

  return {
    test: {
      projects: [
        project("default", [
          "test/**/*.test.ts",
          "!test/**/*.short-ttl.test.ts",
          "!test/**/*.production.test.ts",
          "!test/**/*.node-env-test.test.ts",
          "!test/client/**",
        ]),
        // Time limits set to seconds, so expiry tests wait in real time (spec 7.0).
        project("short-ttl", ["test/**/*.short-ttl.test.ts"], {
          RESET_LINK_TTL_SECONDS: "3",
          SOCKET_MAX_LIFETIME_SECONDS: "3",
        }),
        // Better Auth reads NODE_ENV once, when it is imported, so a production-like run
        // needs its own runtime instead of a changed env inside the default one (spec 7.0).
        project("production", ["test/**/*.production.test.ts"], { NODE_ENV: "production" }),
        // The library's weakest defaults (origin check skipped, secret check skipped).
        project("node-env-test", ["test/**/*.node-env-test.test.ts"], { NODE_ENV: "test" }),
        // The browser's room connection, on plain Node with controlled time and a fake browser.
        { test: { name: "client", environment: "node", include: ["test/client/**/*.test.ts"] } },
        // The production scripts, on plain Node. None of it runs wrangler or the network.
        { test: { name: "scripts", environment: "node", include: ["test/scripts/**/*.test.mjs"] } },
      ],
    },
  };
});
