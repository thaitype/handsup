/**
 * Numbers for spec section 14, taken on local workerd. They describe this machine and a
 * nearly empty database, not Cloudflare. The assertions only prove the instruments work.
 */
import { hashPassword, verifyPassword } from "@better-auth/utils/password";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker/index.ts";
import { countingD1 } from "./support/d1-counter.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";

/** workerd may hold the clock still between I/O, so each reading follows a D1 round trip. */
async function now() {
  await env.DB.prepare("select 1").all();
  return Date.now();
}

async function wallTimes(runs: number, work: () => Promise<unknown>) {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = await now();
    await work();
    times.push((await now()) - start);
  }
  times.sort((a, b) => a - b);
  return { min: times[0]!, median: times[Math.floor(runs / 2)]!, max: times[runs - 1]! };
}

describe("measurements", () => {
  it("times password hashing in workerd", { timeout: 60_000 }, async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(stored, PASSWORD)).toBe(true);
    expect(await verifyPassword(stored, "wrong")).toBe(false);

    const nothing = await wallTimes(20, async () => {});
    const hash = await wallTimes(20, () => hashPassword(PASSWORD));
    const verify = await wallTimes(20, () => verifyPassword(stored, PASSWORD));
    console.log("MEASURE wall ms (20 runs)", JSON.stringify({ nothing, hash, verify }));

    // If the clock were frozen, hashing would look as fast as doing nothing.
    expect(hash.median).toBeGreaterThan(nothing.median + 10);
  });

  it("counts D1 queries and rows per request", async () => {
    const counter = countingD1(env.DB);
    const browser = new Browser(async (request) =>
      app.fetch(request, { ...env, DB: counter.database }),
    );
    const report: Record<string, object> = {};
    const measure = async (label: string, request: () => Promise<Response>, status = 200) => {
      counter.queries.length = 0;
      expect((await request()).status, label).toBe(status);
      const total = (key: "rowsRead" | "rowsWritten") =>
        counter.queries.reduce((sum, query) => sum + query[key], 0);
      report[label] = {
        queries: counter.queries.length,
        rowsRead: total("rowsRead"),
        rowsWritten: total("rowsWritten"),
        statements: counter.queries.map((q) => q.sql.replace(/"/g, "").split(" ").slice(0, 3).join(" ")),
      };
      return counter.queries.length;
    };
    const email = uniqueEmail("measure");

    // Controls: a request that never touches the database, and one that must.
    expect(await measure("unknown route", () => browser.fetch("/api/nothing"), 404)).toBe(0);
    expect(await measure("sign-up", () => browser.signUp(email))).toBeGreaterThan(0);
    await measure("GET /api/me with session", () => browser.fetch("/api/me"));
    await measure("sign-out", () => browser.fetch("/api/auth/sign-out", {}));
    await measure("GET /api/me without session", () => browser.fetch("/api/me"), 401);
    await measure("sign-in", () => browser.signIn(email));
    await measure("sign-in again", () => browser.signIn(email));
    await measure("sign-in wrong password", () => browser.signIn(email, "not-the-password"), 401);

    for (const [label, numbers] of Object.entries(report)) {
      console.log("MEASURE D1", label, JSON.stringify(numbers));
    }
  });
});
