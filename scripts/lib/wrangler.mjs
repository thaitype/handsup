// Running commands for the production scripts: nothing private reaches the terminal.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { d1OnlyConfig, findDatabaseId, redactor } from "./production.mjs";

export const root = fileURLToPath(new URL("../..", import.meta.url));
export const wrangler = join(root, "node_modules/.bin/wrangler");

let known = [];
let redact = redactor(known);
/** Adds values that must never be printed. */
export function hide(...values) {
  known = [...known, ...values];
  redact = redactor(known);
}
export const clean = (text) => redact(text);
export const say = (line) => console.log(redact(line));

/** Runs a command, prints it and its output redacted, and stops on failure. */
export function run(command, args, { env = process.env, quiet = false, announce = true } = {}) {
  const line = `$ ${[command.replace(root, ""), ...args].join(" ")}`;
  if (announce) say(line);
  const result = spawnSync(command, args, {
    cwd: root,
    // CI=1: wrangler never stops to ask a question that nobody could see.
    env: { ...env, CI: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    if (!announce) say(line);
    say(output);
    throw new Error(`the command failed (exit ${result.status ?? result.signal})`);
  }
  if (!quiet) say(output);
  return { stdout: result.stdout, output };
}

/** The remote database's id, looked up by name and hidden from all later output. */
export function databaseId(name) {
  const id = findDatabaseId(run(wrangler, ["d1", "list", "--json"], { quiet: true }).stdout, name);
  hide(id);
  return id;
}

/** Calls `use` with a temporary D1-only config that holds the real id, then removes it. */
export function withRemoteD1Config(use) {
  const text = readFileSync(join(root, "wrangler.jsonc"), "utf8");
  const directory = join(root, ".wrangler/production");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "d1.json");
  writeFileSync(path, JSON.stringify(d1OnlyConfig(text, databaseId("handsup"), join(root, "migrations"))));
  try {
    return use(path);
  } finally {
    rmSync(path, { force: true });
  }
}
