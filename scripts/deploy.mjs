// Production deploy of the handsup Worker. Run each step on purpose, in this order:
//   node scripts/deploy.mjs create-db                      creates the D1 database (once)
//   node scripts/deploy.mjs migrate                        applies migrations to the remote D1
//   node scripts/deploy.mjs deploy --instructors ""        builds and deploys
// Options:
//   --secrets <path>      default ~/handsup.secrets: BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID,
//                         GOOGLE_CLIENT_SECRET, HANDSUP_DOMAIN
//   --instructors <list>  required for deploy. "" is allowed and means nobody is an instructor
//   --dry-run             deploy only: build and let wrangler check, without the account
//   --replace-existing-dns  deploy even though the domain already serves something else
// Nothing private is printed: wrangler's output passes through a redactor.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { domainBlocker } from "./lib/domain.mjs";
import { checkInstructors, parseSecretsFile, SECRET_KEYS, withDatabaseId } from "./lib/production.mjs";
import { clean, databaseId, hide, root, run, say, withRemoteD1Config, wrangler } from "./lib/wrangler.mjs";

const NAME = "handsup";
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

/** A dry run gets an empty wrangler home and no tokens, so it cannot reach any account. */
function withoutAccount() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(CLOUDFLARE|CF)_/.test(key)),
  );
  const home = mkdtempSync(join(tmpdir(), "handsup-noauth-"));
  return { env: { ...env, HOME: home, XDG_CONFIG_HOME: home }, home };
}

function createDatabase() {
  // Asia-Pacific: the class is in Thailand. The location cannot be changed later.
  run(wrangler, ["d1", "create", NAME, "--location", "apac", "--update-config=false"]);
}

function migrate() {
  withRemoteD1Config((config) =>
    run(wrangler, ["d1", "migrations", "apply", "DB", "--remote", "--config", config]),
  );
}

async function deploy({ secretsPath, instructors, dryRun, replaceDns }) {
  if (instructors === undefined) {
    throw new Error('deploy needs --instructors; pass --instructors "" for none');
  }
  const list = checkInstructors(instructors);
  const secrets = parseSecretsFile(readFileSync(secretsPath, "utf8"));
  const domain = secrets.HANDSUP_DOMAIN;
  hide(...Object.values(secrets), ...list.split(","), instructors);

  const dirty = run("git", ["status", "--porcelain"], { quiet: true }).stdout.trim();
  if (dirty) throw new Error(`the working tree is not clean:\n${dirty}`);
  const commit = run("git", ["rev-parse", "HEAD"], { quiet: true }).stdout.trim();

  rmSync(join(root, "dist"), { recursive: true, force: true });
  run("pnpm", ["run", "build"], { quiet: true });
  run("pnpm", ["run", "check:bundle"]);
  // vite copies a developer's .dev.vars next to the built Worker. It has no place there.
  rmSync(join(root, "dist/handsup/.dev.vars"), { force: true });

  const configPath = join(root, "dist/handsup/wrangler.json");
  // Without a terminal, wrangler takes over an existing DNS record or another Worker's custom
  // domain without asking, so this script looks first.
  if (!dryRun && !replaceDns) {
    const blocker = await domainBlocker(domain);
    if (blocker) throw new Error(`${blocker}. Pass --replace-existing-dns only if it may be overwritten`);
  }
  const id = dryRun ? PLACEHOLDER_ID : databaseId(NAME);
  writeFileSync(configPath, JSON.stringify(withDatabaseId(JSON.parse(readFileSync(configPath, "utf8")), id)));

  // Only the three secrets, in a private temporary file that is removed whatever happens.
  const temporary = mkdtempSync(join(tmpdir(), "handsup-secrets-"));
  const account = dryRun ? withoutAccount() : null;
  const cleanUp = () => {
    rmSync(temporary, { recursive: true, force: true });
    if (account) rmSync(account.home, { recursive: true, force: true });
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      cleanUp();
      process.exit(130);
    });
  }
  try {
    const secretsFile = join(temporary, "secrets.json");
    writeFileSync(secretsFile, JSON.stringify(Object.fromEntries(SECRET_KEYS.map((k) => [k, secrets[k]]))));
    chmodSync(secretsFile, 0o600);
    const args = [
      "deploy",
      "--config", configPath,
      "--domain", domain,
      "--var", `BETTER_AUTH_URL:https://${domain}`,
      "--var", `INSTRUCTOR_EMAILS:${list}`,
      "--secrets-file", secretsFile,
      ...(dryRun ? ["--dry-run", "--outdir", join(temporary, "out")] : []),
    ];
    const { output } = run(wrangler, args, account ? { env: account.env } : {});
    if (dryRun) {
      // R22: the bindings wrangler would upload, the empty instructor list included.
      const wanted = ["ROOM", "DB", "BETTER_AUTH_URL", "INSTRUCTOR_EMAILS", ...SECRET_KEYS];
      const missing = wanted.filter((name) => !new RegExp(`env\\.${name}\\b`).test(output));
      if (missing.length > 0) throw new Error(`dry run does not show the bindings: ${missing.join(", ")}`);
      say(`dry run OK: ${wanted.join(", ")} present; instructors listed: ${list ? list.split(",").length : 0}`);
    } else {
      say(`deployed commit ${commit}; instructors listed: ${list ? list.split(",").length : 0}`);
    }
  } finally {
    cleanUp();
  }
  if (run("git", ["status", "--porcelain"], { quiet: true }).stdout.trim()) {
    throw new Error("the working tree changed during the deploy: check it before committing anything");
  }
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      secrets: { type: "string", default: join(homedir(), "handsup.secrets") },
      instructors: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "replace-existing-dns": { type: "boolean", default: false },
    },
  });
  const [step, ...extra] = positionals;
  if (extra.length > 0) throw new Error("one step at a time");
  if (values["dry-run"] && step !== "deploy") throw new Error("--dry-run belongs to deploy only");
  if (step === "create-db") createDatabase();
  else if (step === "migrate") migrate();
  else if (step === "deploy") {
    await deploy({
      secretsPath: values.secrets,
      instructors: values.instructors,
      dryRun: values["dry-run"],
      replaceDns: values["replace-existing-dns"],
    });
  } else throw new Error("say which step: create-db, migrate or deploy");
} catch (error) {
  console.error(clean(`deploy: ${error.message}`));
  process.exit(1);
}
