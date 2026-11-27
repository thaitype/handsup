// Removes exactly the accounts one prod-check run made, and their data.
//   node scripts/prod-cleanup.mjs --remote          prints what it would delete
//   node scripts/prod-cleanup.mjs --remote --yes    deletes it
// --local uses the local D1 instead. --state <path> (default ~/handsup-prodcheck.json).
// Questions live in the room object, so they are deleted through the app as their authors;
// the accounts and everything else are then deleted from D1.
import { readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { cleanupSql } from "./lib/check.mjs";
import { browser } from "./lib/client.mjs";
import { clean, run, say, withRemoteD1Config, wrangler } from "./lib/wrangler.mjs";

async function main() {
  const { values } = parseArgs({
    options: {
      state: { type: "string", default: join(homedir(), "handsup-prodcheck.json") },
      local: { type: "boolean", default: false },
      remote: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
  });
  if (values.local === values.remote) throw new Error("say which database: --local or --remote");
  const { baseUrl, roomId, accounts } = JSON.parse(readFileSync(values.state, "utf8"));
  const host = new URL(baseUrl).hostname;
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (isLocal !== values.local) throw new Error("the state file's site and --local/--remote disagree");
  const sql = cleanupSql(accounts.map((account) => account.email));

  const withDatabase = (use) =>
    values.local ? use(["DB", "--local"]) : withRemoteD1Config((config) => use(["DB", "--remote", "--config", config]));
  const query = (target, command) => {
    const { stdout } = run(wrangler, ["d1", "execute", ...target, "--json", "--yes", "--command", command], {
      quiet: true,
      announce: false,
    });
    return JSON.parse(stdout.slice(stdout.indexOf("["))).at(-1).results;
  };

  const { found, before } = withDatabase((target) => ({
    found: query(target, sql.found).map((row) => row.email),
    before: query(target, sql.count)[0],
  }));
  if (before.rooms_created > 0) throw new Error("a listed account owns a room: nothing deleted");

  // Only the accounts that exist can have posted. Each signs in and sees its own questions.
  const posts = [];
  for (const account of accounts.filter(({ email }) => found.includes(email) && !/-load-/.test(email))) {
    const client = browser(baseUrl);
    const signIn = await client.request("/api/auth/sign-in/email", {
      email: account.email,
      password: account.password,
    });
    // Going on would remove the author and leave the questions behind.
    if (signIn.status !== 200) throw new Error(`a test account cannot sign in (${signIn.status}): nothing deleted`);
    if (!roomId) continue;
    const snapshot = await client.request(`/api/rooms/${roomId}/snapshot`);
    if (snapshot.status !== 200) throw new Error(`cannot read the test room (${snapshot.status}): nothing deleted`);
    for (const question of snapshot.json.questions.filter((q) => q.isMine)) posts.push({ client, question });
  }

  console.log("Will delete:");
  for (const email of found) say(`  account ${email.replace("@", " at ")}`);
  for (const { question } of posts) {
    console.log(`  ${question.visibility} question "${question.body}" and ${question.answers.length} message(s) under it`);
  }
  console.log(
    `  database rows: ${Object.entries(before)
      .filter(([key]) => !["rooms_created", "other_users"].includes(key))
      .map(([table, count]) => `${table} ${count}`)
      .join(", ")}`,
  );
  console.log(`Left alone: ${before.other_users} other account(s), every room, and the rate limit counters.`);
  if (!values.yes) {
    console.log("Nothing was deleted. Add --yes to delete exactly this.");
    return;
  }

  for (const { client, question } of posts) {
    const gone = await client.request(`/api/rooms/${roomId}/questions/${question.id}`, undefined, "DELETE");
    if (gone.status !== 200) throw new Error(`deleting a question answered ${gone.status}: accounts kept`);
  }
  const after = withDatabase((target) => {
    query(target, sql.remove);
    return query(target, sql.count)[0];
  });
  const left = Object.entries(after).filter(([key, count]) => key !== "other_users" && count !== 0);
  if (left.length > 0) throw new Error(`rows remain: ${JSON.stringify(Object.fromEntries(left))}`);
  console.log(
    `Deleted ${posts.length} question(s) and ${found.length} account(s). Other accounts: ${before.other_users} before, ${after.other_users} after.`,
  );
  rmSync(values.state);
}

try {
  await main();
} catch (error) {
  console.error(clean(`prod-cleanup: ${error.message}`));
  process.exit(1);
}
