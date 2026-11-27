/** Spec N5: length, posting rate and the room ceiling. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { POST_LIMIT, POST_WINDOW_MS, ROOM_MAX_QUESTIONS } from "../src/shared/protocol.ts";
import { takePostAttempt } from "../src/worker/post-limit.ts";
import { classroom, questionFrom, roomApi, snapshotFrom } from "./support/classroom.ts";

describe("body length", () => {
  it("accepts 1 to 4,000 characters and refuses outside that", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const asked = await questionFrom(await api.ask(a.browser, "x"));
    for (const body of ["", "   \n ", "x".repeat(4001), "ก".repeat(4001)]) {
      expect((await api.ask(a.browser, body)).status, `question ${body.length}`).toBe(400);
      expect((await api.answer(instructor, asked.id, body)).status, `answer ${body.length}`).toBe(400);
    }
    // 4,000 characters is counted in characters, not in UTF-16 units.
    for (const body of ["x".repeat(4000), "ก".repeat(4000), "😀".repeat(4000)]) {
      expect((await questionFrom(await api.ask(a.browser, body))).body).toBe(body);
    }
    expect((await api.answer(instructor, asked.id, "y".repeat(4000))).status).toBe(200);
  });
});

describe("posting rate", () => {
  it(`allows ${POST_LIMIT} posts a minute for each user, across rooms`, async () => {
    const first = await classroom("One");
    const second = await classroom("Two");
    const a = await first.member("A");
    expect((await a.browser.fetch("/api/join", { code: second.room.inviteCode })).status).toBe(200);
    const b = await first.member("B");
    for (let i = 0; i < POST_LIMIT; i++) {
      const target = i % 2 === 0 ? first : second;
      expect((await roomApi(target.room.id).ask(a.browser, `post ${i}`)).status, `post ${i}`).toBe(200);
    }
    const over = await roomApi(first.room.id).ask(a.browser, "one too many");
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "rate_limited" });
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await roomApi(second.room.id).ask(a.browser, "nor there")).status).toBe(429);
    // Control: another user posts in the same room, and reading is not limited.
    expect((await roomApi(first.room.id).ask(b.browser, "B is fine")).status).toBe(200);
    expect((await roomApi(first.room.id).snapshot(a.browser)).status).toBe(200);
    const bodies = (await snapshotFrom(await roomApi(first.room.id).snapshot(a.browser))).questions.map((q) => q.body);
    expect(bodies).not.toContain("one too many");
  });

  it("counts answers as posts too", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const asked = await questionFrom(await api.ask(a.browser, "q"));
    const statuses: number[] = [];
    for (let i = 0; i <= POST_LIMIT; i++) statuses.push((await api.answer(instructor, asked.id, `a${i}`)).status);
    expect(statuses).toEqual([...Array<number>(POST_LIMIT).fill(200), 429]);
    // Resolving and deleting are not posts.
    expect((await api.resolve(instructor, asked.id)).status).toBe(200);
    expect((await api.removeQuestion(instructor, asked.id)).status).toBe(200);
  });

  it("starts again in the next window", async () => {
    const { member } = await classroom();
    const a = await member("Window");
    const user = await env.DB.prepare('select id from "user" where email = ?').bind(a.email).first<{ id: string }>();
    const t0 = 5_000_000;
    for (let i = 0; i < POST_LIMIT; i++) expect((await takePostAttempt(env.DB, user!.id, t0 + i)).allowed).toBe(true);
    expect((await takePostAttempt(env.DB, user!.id, t0 + POST_WINDOW_MS - 1)).allowed).toBe(false);
    expect((await takePostAttempt(env.DB, user!.id, t0 + POST_WINDOW_MS)).allowed).toBe(true);
  });
});

describe("room ceiling", () => {
  it(`holds ${ROOM_MAX_QUESTIONS} questions and refuses the next without saying how many`, async () => {
    const { room, instructor, member, stub } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    // All but one are written straight into the room's table, as hidden questions of A.
    await runInDurableObject(stub, (_object, state) => {
      for (let i = 0; i < ROOM_MAX_QUESTIONS - 1; i++) {
        state.storage.sql.exec(
          `insert into question (id, author_id, author_name, visibility, body, created_at, client_request_id)
           values (?, 'seed', 'Seed', 'private', 'seed', ?, ?)`,
          crypto.randomUUID(),
          i,
          `seed-${i}`,
        );
      }
    });
    const key = crypto.randomUUID();
    const last = await questionFrom(await api.ask(a.browser, "the thousandth", "public", key));

    const over = await api.ask(b.browser, "one over");
    expect(over.status).toBe(409);
    const text = await over.text();
    expect(JSON.parse(text)).toEqual({ error: "room_full" });
    expect(text + [...over.headers]).not.toMatch(/\b(999|1000|1,000)\b/);
    // A retry of a question that got in is still answered, and writing nothing new.
    expect((await questionFrom(await api.ask(a.browser, "the thousandth", "public", key))).id).toBe(last.id);
    expect((await snapshotFrom(await api.snapshot(instructor))).questions).toHaveLength(ROOM_MAX_QUESTIONS);
    // Control: with one place free the same user gets in.
    expect((await api.removeQuestion(instructor, last.id)).status).toBe(200);
    expect((await api.ask(b.browser, "now it fits")).status).toBe(200);
  });
});
