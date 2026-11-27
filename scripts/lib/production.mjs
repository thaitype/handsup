// Pure helpers for scripts/deploy.mjs, kept apart so they can be tested without wrangler.
import { z } from "zod";

export const SECRET_KEYS = ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
export const FILE_KEYS = [...SECRET_KEYS, "HANDSUP_DOMAIN"];

/** KEY=value lines; blank lines and # comments are skipped. Errors name keys, never values. */
export function parseSecretsFile(text) {
  const values = {};
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`secrets file line ${index + 1} is not KEY=value`);
    const [, key, rest] = match;
    if (!FILE_KEYS.includes(key)) throw new Error(`secrets file has an unexpected key: ${key}`);
    if (key in values) throw new Error(`secrets file sets ${key} twice`);
    const quoted = /^(["'])(.*)\1$/.exec(rest);
    values[key] = quoted ? quoted[2] : rest;
  }
  const missing = FILE_KEYS.filter((key) => !values[key]);
  if (missing.length > 0) throw new Error(`secrets file is missing: ${missing.join(", ")}`);
  if (values.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  const domain = values.HANDSUP_DOMAIN;
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("HANDSUP_DOMAIN must be a bare lowercase host name: no https://, path or port");
  }
  return values;
}

/** The same rule as the Worker (spec 7.3). Empty is valid and means no instructors. */
export function checkInstructors(raw) {
  if (raw === "") return "";
  const entries = raw.split(",").map((entry) => entry.trim().toLowerCase());
  const bad = entries.filter((entry) => !z.email().safeParse(entry).success).length;
  if (bad > 0) throw new Error(`--instructors has ${bad} invalid entr${bad === 1 ? "y" : "ies"}`);
  return entries.join(",");
}

/**
 * Removes private values from anything about to be printed: the ones we know, plus anything
 * shaped like an email address, a database id or an account id.
 */
export function redactor(known) {
  const values = [...new Set(known.filter((value) => value && value.length >= 4))].sort(
    (a, b) => b.length - a.length,
  );
  return (text) => {
    let out = text;
    for (const value of values) out = out.split(value).join("<redacted>");
    return out
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
      .replace(/\b[0-9a-f]{32}\b/gi, "<id>")
      .replace(/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev/gi, "<workers.dev>");
  };
}

/** The D1 id for a database name, from `wrangler d1 list --json`. Exactly one must match. */
export function findDatabaseId(listJson, name) {
  const start = listJson.indexOf("[");
  const databases = JSON.parse(listJson.slice(start));
  const found = databases.filter((database) => database.name === name);
  if (found.length !== 1) throw new Error(`expected one D1 database named ${name}, found ${found.length}`);
  return found[0].uuid;
}

/** The config for D1 commands against the remote database: the real id, nothing else. */
export function d1OnlyConfig(wranglerJsonc, id, migrationsDir) {
  const field = (key) => {
    const found = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(wranglerJsonc);
    if (!found) throw new Error(`wrangler.jsonc has no ${key}`);
    return found[1];
  };
  return {
    name: field("name"),
    compatibility_date: field("compatibility_date"),
    d1_databases: [
      { binding: "DB", database_name: field("database_name"), database_id: id, migrations_dir: migrationsDir },
    ],
  };
}

/** The built Worker config with the real database id put in. Everything else must be as built. */
export function withDatabaseId(config, id) {
  if (Object.keys(config.vars ?? {}).length > 0) throw new Error("the built config has baked vars");
  if (config.name !== "handsup") throw new Error("the built config is not for the handsup Worker");
  if (config.d1_databases?.length !== 1 || config.d1_databases[0].binding !== "DB") {
    throw new Error("the built config does not have exactly the DB binding");
  }
  return {
    ...config,
    workers_dev: false,
    preview_urls: false,
    d1_databases: [{ ...config.d1_databases[0], database_id: id }],
  };
}
