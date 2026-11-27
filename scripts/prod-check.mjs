// Checks a running handsup with two throwaway learner accounts, then a 30-user load check.
//   BASE_URL=https://... INVITE_CODE=... node scripts/prod-check.mjs
// INVITE_CODE is from a test room made for this. Options: EXPECT_COMMIT (default: this
// checkout's HEAD), STATE_FILE (default ~/handsup-prodcheck.json, read by prod-cleanup.mjs),
// SKIP_LOAD=1. It leaves its accounts and questions behind: run prod-cleanup.mjs after.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cookieProblems, percentile, TEST_DOMAIN } from "./lib/check.mjs";
import { browser } from "./lib/client.mjs";

const LOAD_USERS = 30;
// The sign-up and sign-in limits count 60 seconds per address (spec N5).
const LOAD_PAUSE_MS = 61_000;
const SLOW_MS = 5_000;

const { BASE_URL: base, INVITE_CODE: code, SKIP_LOAD } = process.env;
if (!base || !code) {
  console.error("prod-check: set BASE_URL and INVITE_CODE");
  process.exit(2);
}
const stateFile = process.env.STATE_FILE ?? join(homedir(), "handsup-prodcheck.json");
const run = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const account = (label) => ({
  name: `ProdCheck ${label}`,
  email: `prodcheck-${run}-${label}@${TEST_DOMAIN}`,
  password: randomBytes(18).toString("base64url"),
});
const A = account("a");
const B = account("b");
const load = SKIP_LOAD
  ? []
  : Array.from({ length: LOAD_USERS }, (_, i) => account(`load-${String(i + 1).padStart(2, "0")}`));

// Written before any account exists, so the cleanup knows them even if this run dies.
const state = { baseUrl: base, roomId: null, accounts: [A, B, ...load] };
const save = (flag) => writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600, flag });
try {
  save("wx");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.error(`prod-check: ${stateFile} exists. Run prod-cleanup.mjs for that run first.`);
  process.exit(2);
}

let failed = 0;
const report = (verdict, name, detail = "") => {
  if (verdict === "FAIL") failed++;
  console.log(`${verdict.padEnd(7)} ${name}${detail ? `: ${detail}` : ""}`);
};
const expect = (ok, name, detail) => report(ok ? "PASS" : "FAIL", name, ok ? "" : detail);
/** A step the later checks depend on. */
const need = (response, name) => {
  if (response.status !== 200) throw new Error(`${name} answered ${response.status} ${response.json?.error ?? ""}`);
  return response;
};

async function checks() {
  const anonymous = browser(base);
  const version = need(await anonymous.request("/api/version"), "/api/version").json;
  const commit =
    process.env.EXPECT_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  expect(version.commit === commit, "version is the expected commit", `running ${version.commit}, expected ${commit}`);
  expect(version.dirty === false, "built from a clean tree", "dirty is not false");

  const a = browser(base);
  const b = browser(base);
  const signedUp = need(await a.request("/api/auth/sign-up/email", A), "sign-up A");
  need(await b.request("/api/auth/sign-up/email", B), "sign-up B");
  if (new URL(base).protocol === "https:") {
    const problems = cookieProblems(signedUp.setCookies);
    expect(problems.length === 0, "session cookie is secure", problems.join(", "));
  } else report("SKIP", "session cookie is secure", "BASE_URL is not https");
  for (const [who, client] of [["A", a], ["B", b]]) {
    const me = need(await client.request("/api/me"), `/api/me ${who}`).json;
    expect(me.role === "learner", `${who} is a learner`, `role is ${me.role}`);
  }
  const room = need(await a.request("/api/join", { code }), "join A").json.room;
  need(await b.request("/api/join", { code }), "join B");
  state.roomId = room.id;
  save("w");

  const socketA = a.socket(room.id);
  const socketB = b.socket(room.id);
  try {
    const open = (await socketA.received('"snapshot"')) && (await socketB.received('"snapshot"'));
    expect(open, "WebSocket opens and sends a snapshot", "no snapshot within 10 s");

    const secret = `prodcheck private ${randomUUID()}`;
    const open1 = `prodcheck public ${randomUUID()}`;
    const ask = async (body, visibility) =>
      need(
        await a.request(`/api/rooms/${room.id}/questions`, { body, visibility, clientRequestId: randomUUID() }),
        `ask ${visibility}`,
      ).json.question;
    // The private one first: once B has the later public one, a leak would have arrived too.
    const hidden = await ask(secret, "private");
    const shown = await ask(open1, "public");
    expect(await socketA.received(secret), "control: the asker's socket gets the private question", "not received");
    const publicOnSocket = await socketB.received(open1);
    expect(publicOnSocket, "control: another learner's socket gets the public question", "not received");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const leaked = (text) => text.includes(secret) || text.includes(hidden.id);
    if (publicOnSocket) {
      expect(!socketB.frames.some(leaked), "private question is not on another learner's socket", "LEAKED");
    } else report("FAIL", "private question is not on another learner's socket", "unproven without the control");

    // The polling path: a client without a socket reads the snapshot again.
    const own = need(await a.request(`/api/rooms/${room.id}/snapshot`), "snapshot A");
    expect(leaked(own.text), "control: the asker's snapshot has the private question", "missing");
    const other = need(await b.request(`/api/rooms/${room.id}/snapshot`), "snapshot B");
    const seen = other.text.includes(shown.id);
    expect(seen, "control: another learner's snapshot has the public question", "missing");
    expect(seen && !leaked(other.text), "private question is not in another learner's snapshot", "LEAKED or unproven");
    const later = await ask(`prodcheck polling ${randomUUID()}`, "public");
    const polled = need(await b.request(`/api/rooms/${room.id}/snapshot`), "second poll");
    expect(polled.text.includes(later.id), "polling: the next snapshot has a new question", "missing");
    expect(!leaked(polled.text), "polling: the next snapshot still hides the private one", "LEAKED");
    const outside = await anonymous.request(`/api/rooms/${room.id}/snapshot`);
    expect(outside.status === 401, "snapshot needs a session", `answered ${outside.status}`);
  } finally {
    socketA.close();
    socketB.close();
  }

  if (load.length === 0) return report("SKIP", "load check", "SKIP_LOAD is set");
  await burst("sign-up", load);
  console.log(`waiting ${LOAD_PAUSE_MS / 1000} s for the rate limit window`);
  await new Promise((resolve) => setTimeout(resolve, LOAD_PAUSE_MS));
  await burst("sign-in", load);
}

/** All users at once. Every request must succeed; a slow p99 is a finding for the owner. */
async function burst(kind, users) {
  const results = await Promise.all(
    users.map(async ({ name, email, password }) => {
      const body = kind === "sign-up" ? { name, email, password } : { email, password };
      const started = performance.now();
      try {
        const response = await browser(base).request(`/api/auth/${kind}/email`, body);
        const resource = /error code:\s*1102|exceeded(Cpu| resource limits)/i.test(response.text);
        return { status: resource ? `${response.status} (CPU limit)` : String(response.status), ms: performance.now() - started };
      } catch (error) {
        return { status: error.name, ms: performance.now() - started };
      }
    }),
  );
  const statuses = {};
  for (const { status } of results) statuses[status] = (statuses[status] ?? 0) + 1;
  const times = results.map((result) => result.ms);
  const p99 = Math.round(percentile(times, 99));
  const summary = `statuses ${JSON.stringify(statuses)}, p50 ${Math.round(percentile(times, 50))} ms, p99 ${p99} ms`;
  const ok = statuses["200"] === users.length;
  report(ok ? "PASS" : "FAIL", `load: ${users.length} concurrent ${kind}s`, summary);
  if (p99 > SLOW_MS) report("FINDING", `${kind} p99 is over ${SLOW_MS / 1000} s`, "tell Mild (AC25)");
}

try {
  await checks();
} catch (error) {
  report("FAIL", "stopped early", error.message);
}
console.log(failed === 0 ? "prod-check: no failures" : `prod-check: ${failed} FAILED`);
console.log(`test accounts are recorded in ${stateFile}; remove them with scripts/prod-cleanup.mjs`);
process.exit(failed === 0 ? 0 : 1);
