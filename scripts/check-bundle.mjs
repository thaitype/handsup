// Gate (spec 7.1): the built Worker must hash passwords with native node:crypto scrypt,
// never the pure JavaScript fallback. Run after `pnpm build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist/handsup";
const files = readdirSync(root, { recursive: true }).map(String);
const scripts = files.filter((file) => file.endsWith(".js"));
const maps = files.filter((file) => file.endsWith(".js.map"));
const read = (file) => readFileSync(join(root, file), "utf8");

const sources = maps.flatMap((file) => JSON.parse(read(file)).sources);
const importsNativeScrypt = scripts.some((file) =>
  /import\s*\{[^}]*\bscrypt\b[^}]*\}\s*from\s*["']node:crypto["']/.test(read(file)),
);

const failures = [];
if (scripts.length === 0 || maps.length === 0) failures.push("no scripts or source maps to inspect");
if (!importsNativeScrypt) failures.push("no script imports scrypt from node:crypto");
if (!sources.some((s) => s.endsWith("@better-auth/utils/dist/password.node.mjs"))) {
  failures.push("the native password module is not in the bundle");
}
for (const source of sources) {
  if (/@better-auth\/utils\/dist\/password\.mjs$|@noble\/hashes\/scrypt\.js$/.test(source)) {
    failures.push(`pure JavaScript scrypt is bundled: ${source.replace(/^.*node_modules\//, "")}`);
  }
}

// No variable may be baked into the deployable config: secrets and INSTRUCTOR_EMAILS are
// passed at deploy time (spec 7.3), and an e2e build would carry test values (review round 9).
const deployConfig = JSON.parse(read("wrangler.json"));
const baked = Object.keys(deployConfig.vars ?? {});
if (baked.length > 0) failures.push(`wrangler.json has baked vars: ${baked.join(", ")}`);

console.log(`checked ${scripts.length} scripts, ${maps.length} source maps, ${sources.length} sources in ${root}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("OK: native node:crypto scrypt only");
