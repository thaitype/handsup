/** AC31 and spec 7.7: the list of learners, for instructors only. */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { LEARNERS_PAGE_SIZE, type LearnersPage } from "../src/shared/learners.ts";
import { admin } from "../src/worker/admin.ts";
import { classroom, everything, instructorBrowser, INSTRUCTOR_EMAIL } from "./support/classroom.ts";
import { countingD1 } from "./support/d1-counter.ts";
import { Browser, ORIGIN, uniqueEmail } from "./support/http.ts";

const list = (browser: Browser, query = "") => browser.fetch(`/api/admin/learners${query}`);
async function page(browser: Browser, query = ""): Promise<LearnersPage> {
  const response = await list(browser, query);
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as LearnersPage;
}
const emails = (result: LearnersPage) => result.learners.map((l) => l.email);

/** An account row written directly: sign-up is slow, and it lowercases the address. */
async function account(name: string, email = uniqueEmail("row"), createdAt = new Date().toISOString()) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, 0, ?, ?)',
  )
    .bind(id, name, email, createdAt, createdAt)
    .run();
  return { id, email };
}
const join = (roomId: string, userId: string) =>
  env.DB.prepare("insert into room_member (room_id, user_id, joined_at) values (?, ?, 0)").bind(roomId, userId).run();

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("delete from room"), env.DB.prepare('delete from "user"')]);
});

describe("who may list learners", () => {
  it("refuses a guest and a learner, whatever they ask, and tells them nothing", async () => {
    const { room, instructor, member, guest } = await classroom("Secret room");
    const a = await member("A");
    const b = await member("B");
    // Control: the instructor gets exactly what the others must not.
    expect(emails(await page(instructor))).toContain(b.email);
    for (const query of ["", `?room=${room.id}`, "?q=B", "?page=0", "?nonsense=1", "?room=missing"]) {
      for (const [browser, status, error] of [
        [guest, 401, "unauthenticated"],
        [a.browser, 403, "forbidden"],
      ] as const) {
        const refused = await everything(await list(browser, query));
        expect(refused.status, query).toBe(status);
        expect(JSON.parse(refused.body)).toEqual({ error });
        expect(refused.all).not.toContain(b.email);
        expect(refused.all).not.toContain("Secret room");
      }
    }
  });

  it("is never cached and cannot be written to", async () => {
    const instructor = await instructorBrowser();
    const response = await list(instructor);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await instructor.fetch("/api/admin/learners", {})).status).toBe(404);
  });
});

describe("who is in the list", () => {
  it("holds every learner, in a room or not, with exactly these fields", async () => {
    const { room, instructor, member, outsider } = await classroom("Physics");
    const inside = await member("Inside", "Anna");
    const outside = await outsider("Outside", "Bo");
    const before = Date.now();
    const late = await outsider("Late", "Cy");
    const result = await page(instructor);
    expect(result).toMatchObject({ page: 1, pageSize: LEARNERS_PAGE_SIZE, total: 3 });
    expect(emails(result)).toEqual([inside.email, outside.email, late.email]);
    expect(Object.keys(result.learners[0]!).sort()).toEqual(["createdAt", "email", "id", "name", "rooms"]);
    expect(result.learners.map((l) => l.rooms)).toEqual([[{ id: room.id, name: "Physics" }], [], []]);
    expect(result.learners[2]!.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.learners[2]!.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it("leaves out every instructor, in any letter case, even one with a room membership", async () => {
    const { room, instructor } = await classroom();
    const second = await account("Second", "Second.Teacher@Example.TEST");
    await join(room.id, second.id);
    // Addresses that only look like an instructor's are learners.
    const near = await account("Near", `x${INSTRUCTOR_EMAIL}`);
    for (const query of ["", `?room=${room.id}`, "?q=teacher"]) {
      const found = emails(await page(instructor, query));
      expect(found, query).not.toContain(INSTRUCTOR_EMAIL);
      expect(found, query).not.toContain(second.email);
    }
    expect(await page(instructor)).toMatchObject({ total: 1, learners: [{ email: near.email }] });
  });
});

describe("the room filter", () => {
  it("keeps the members of that room, with all of their rooms", async () => {
    const maths = await classroom("Maths");
    const art = await classroom("Art");
    const { instructor } = maths;
    const m = await maths.member("M", "Mia");
    const both = await maths.member("Both", "Noa");
    expect((await both.browser.fetch("/api/join", { code: art.room.inviteCode })).status).toBe(200);
    const a = await art.member("R", "Ola");
    const none = await maths.outsider("None", "Pim");
    // Control: without the filter everyone is there.
    expect(emails(await page(instructor))).toEqual([m.email, both.email, a.email, none.email]);
    const filtered = await page(instructor, `?room=${maths.room.id}`);
    expect(emails(filtered)).toEqual([m.email, both.email]);
    expect(filtered.total).toBe(2);
    expect(filtered.learners[1]!.rooms.map((r) => r.name)).toEqual(["Art", "Maths"]);
    expect(emails(await page(instructor, `?room=${art.room.id}`))).toEqual([both.email, a.email]);
    expect(emails(await page(instructor, `?room=${art.room.id}&q=ola`))).toEqual([a.email]);
  });

  it("answers an empty room with nothing and an unknown room with 404", async () => {
    const { room, instructor, outsider } = await classroom("Empty");
    await outsider("Someone");
    expect(await page(instructor, `?room=${room.id}`)).toMatchObject({ total: 0, learners: [] });
    expect((await list(instructor, `?room=${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe("search and pages", () => {
  it("matches part of a name or email, as written", async () => {
    const instructor = await instructorBrowser();
    const percent = await account("100% Sure");
    const under = await account("Under", "under_score@example.test");
    const plain = await account("สมชาย ใจดี", "plain@example.test");
    const found = async (q: string) => emails(await page(instructor, `?q=${encodeURIComponent(q)}`)).sort();
    expect(await found("  SURE ")).toEqual([percent.email]);
    expect(await found("%")).toEqual([percent.email]);
    expect(await found("_")).toEqual([under.email]);
    expect(await found("ใจดี")).toEqual([plain.email]);
    expect(await found("PLAIN@")).toEqual([plain.email]);
    expect(await found("' or 1=1 --")).toEqual([]);
    expect(await found("")).toHaveLength(3);
  });

  it("fills pages with learners only and counts them all", async () => {
    const instructor = await instructorBrowser();
    const total = LEARNERS_PAGE_SIZE * 2 + 3;
    const expected: string[] = [];
    for (let i = 0; i < total; i++) {
      // The same name twice over, so the order has to settle ties.
      const label = String(i >> 1).padStart(3, "0");
      expected.push((await account(`Learner ${label}`, `l${String(i).padStart(3, "0")}@example.test`)).email);
    }
    // An instructor who sorts into the first page.
    await account("Learner 000 teacher", "second.teacher@example.test");
    const seen: string[] = [];
    for (const [number, size] of [[1, LEARNERS_PAGE_SIZE], [2, LEARNERS_PAGE_SIZE], [3, 3], [4, 0]] as const) {
      const result = await page(instructor, `?page=${number}`);
      expect(result.total, `page ${number}`).toBe(total);
      expect(result.learners, `page ${number}`).toHaveLength(size);
      seen.push(...emails(result));
    }
    expect(seen).toEqual(expected);
  });

  it.each([
    "page=0",
    "page=-1",
    "page=1.5",
    "page=two",
    "page=1000000",
    "page=",
    "page=1&page=2",
    "q=a&q=b",
    `q=${"a".repeat(201)}`,
    "room=",
    `room=${"a".repeat(65)}`,
    "limit=1000",
  ])("refuses ?%s", async (query) => {
    const response = await list(await instructorBrowser(), `?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});

describe("database work", () => {
  it("does not grow with the number of learners or rooms", async () => {
    const { room, instructor } = await classroom();
    const queries = async () => {
      const counted = countingD1(env.DB);
      const cookie = instructor.cookieHeader();
      const response = await admin.request(
        `${ORIGIN}/api/admin/learners?room=${room.id}`,
        { headers: { cookie } },
        { ...env, DB: counted.database },
      );
      expect(response.status).toBe(200);
      return { n: counted.queries.length, learners: ((await response.json()) as LearnersPage).learners.length };
    };
    await join(room.id, (await account("One")).id);
    const one = await queries();
    for (let i = 0; i < 12; i++) await join(room.id, (await account(`More ${i}`)).id);
    const many = await queries();
    expect([one.learners, many.learners]).toEqual([1, 13]);
    expect(many.n).toBe(one.n);
    // The session and its user, then the room check, the count and the page.
    expect(many.n).toBeLessThanOrEqual(5);
  });
});
