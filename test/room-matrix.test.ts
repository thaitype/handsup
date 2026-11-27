/**
 * AC12, the room rows of the spec 6.1 matrix, in one table. Every action has cells that
 * are allowed and cells that are refused, run against the same room in the same test.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { takeJoinAttempt, JOIN_LIMIT, JOIN_WINDOW_MS } from "../src/worker/rooms.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";
import { people, roomIds, type Room } from "./support/people.ts";

type Who = "guest" | "learner, not a member" | "member" | "instructor";
type Cell = { who: Who; expect: "allowed" | "refused" };

const listed = async (browser: Browser) => {
  const response = await browser.fetch("/api/rooms");
  if (response.status !== 200) return { status: response.status, rooms: [] };
  return { status: 200, ...((await response.json()) as { rooms: Partial<Room>[] }) };
};

describe("AC12: room actions by role (spec 6.1)", () => {
  it("allows and refuses each action exactly as the matrix says", async () => {
    const { guest, instructor, createRoom, learner } = await people();
    const room = await createRoom("Matrix");
    const member = await learner("member");
    expect((await member.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);
    const outsider = await learner("outsider");
    const as: Record<Who, Browser> = {
      guest,
      "learner, not a member": outsider,
      member,
      instructor,
    };

    type Action = { name: string; cells: Cell[]; run: (b: Browser) => Promise<boolean> };
    const actions: Action[] = [
      {
        name: "see the room in the list",
        cells: [
          { who: "guest", expect: "refused" },
          { who: "learner, not a member", expect: "refused" },
          { who: "member", expect: "allowed" },
          { who: "instructor", expect: "allowed" },
        ],
        run: async (b) => {
          const ids = await roomIds(b);
          return Array.isArray(ids) && ids.includes(room.id);
        },
      },
      {
        name: "see the invite code",
        cells: [
          { who: "guest", expect: "refused" },
          { who: "learner, not a member", expect: "refused" },
          { who: "member", expect: "refused" },
          { who: "instructor", expect: "allowed" },
        ],
        run: async (b) => JSON.stringify(await listed(b)).includes(room.inviteCode),
      },
      {
        name: "rotate the invite code",
        cells: [
          { who: "guest", expect: "refused" },
          { who: "learner, not a member", expect: "refused" },
          { who: "member", expect: "refused" },
          { who: "instructor", expect: "allowed" },
        ],
        run: async (b) => {
          const response = await b.fetch(`/api/rooms/${room.id}/invite-code/rotate`, {});
          if (response.status !== 200) return false;
          room.inviteCode = ((await response.json()) as { inviteCode: string }).inviteCode;
          return true;
        },
      },
      {
        name: "create a room",
        cells: [
          { who: "guest", expect: "refused" },
          { who: "learner, not a member", expect: "refused" },
          { who: "member", expect: "refused" },
          { who: "instructor", expect: "allowed" },
        ],
        run: async (b) => (await b.fetch("/api/rooms", { name: "Created" })).status === 200,
      },
      {
        name: "join with the right code",
        cells: [
          { who: "guest", expect: "refused" },
          { who: "learner, not a member", expect: "allowed" },
          { who: "instructor", expect: "allowed" },
        ],
        run: async (b) => (await b.fetch("/api/join", { code: room.inviteCode })).status === 200,
      },
    ];

    const counts = { allowed: 0, refused: 0 };
    for (const action of actions) {
      // "join" runs last, since its allowed cell makes the outsider a member.
      const kinds = new Set(action.cells.map((cell) => cell.expect));
      expect(kinds, action.name).toEqual(new Set(["allowed", "refused"]));
      for (const cell of action.cells) {
        const allowed = await action.run(as[cell.who]);
        expect(allowed ? "allowed" : "refused", `${action.name} as ${cell.who}`).toBe(cell.expect);
        counts[cell.expect]++;
      }
    }
    console.log("COUNT AC12 room rows", JSON.stringify({ actions: actions.length, ...counts }));
    expect(counts).toEqual({ allowed: 7, refused: 12 });
  });

  it("answers refused room actions with the status spec 6.2 names", async () => {
    const { guest, instructor, createRoom, learner } = await people();
    const room = await createRoom();
    const student = await learner();
    const missing = crypto.randomUUID();
    const rotate = (b: Browser, id: string) => b.fetch(`/api/rooms/${id}/invite-code/rotate`, {});
    expect((await rotate(guest, room.id)).status).toBe(401);
    // A learner gets 403 from the role before any lookup: the same for a real and a missing room.
    expect((await rotate(student, room.id)).status).toBe(403);
    expect((await rotate(student, missing)).status).toBe(403);
    expect((await rotate(instructor, missing)).status).toBe(404);
    expect((await rotate(instructor, room.id)).status).toBe(200);
    expect((await guest.fetch("/api/join", { code: room.inviteCode })).status).toBe(401);
    expect((await guest.fetch("/api/rooms")).status).toBe(401);
  });
});

describe("request bodies (spec 8.5)", () => {
  it("rejects unknown fields and wrong types, and takes the exact shape", async () => {
    const { instructor, createRoom, learner } = await people();
    const room = await createRoom();
    const student = await learner();
    const cases: [Browser, string, unknown][] = [
      [instructor, "/api/rooms", { name: "x", extra: 1 }],
      [instructor, "/api/rooms", { name: "" }],
      [instructor, "/api/rooms", { name: "   " }],
      [instructor, "/api/rooms", { name: "x".repeat(101) }],
      [instructor, "/api/rooms", { name: 5 }],
      [instructor, "/api/rooms", []],
      [instructor, `/api/rooms/${room.id}/invite-code/rotate`, { code: "x" }],
      [student, "/api/join", { code: room.inviteCode, room: room.id }],
      [student, "/api/join", { code: 12345 }],
      [student, "/api/join", {}],
    ];
    for (const [browser, path, body] of cases) {
      const response = await browser.fetch(path, body);
      expect([response.status, await response.json()], `${path} ${JSON.stringify(body)}`).toEqual([
        400,
        { error: "invalid_request" },
      ]);
    }
    // Controls: the exact shapes are accepted.
    expect((await instructor.fetch("/api/rooms", { name: "x".repeat(100) })).status).toBe(200);
    expect((await instructor.fetch(`/api/rooms/${room.id}/invite-code/rotate`, {})).status).toBe(200);
    const fresh = (await (await instructor.fetch("/api/rooms")).json()) as { rooms: Room[] };
    const code = fresh.rooms.find((r) => r.id === room.id)?.inviteCode ?? "";
    expect((await student.fetch("/api/join", { code })).status).toBe(200);
  });
});

describe("the shared write gate", () => {
  const GATE = { error: "unsupported_media_type" };

  it("refuses a write that is not JSON, with its own answer, on app and auth routes alike", async () => {
    const { instructor } = await people();
    const send = async (path: string, type: string | null, body = JSON.stringify({ name: "Gate" })) => {
      const response = await instructor.request(path, {
        method: "POST",
        headers: type ? { "content-type": type } : {},
        body,
      });
      return [response.status, await response.json().catch(() => null)];
    };
    expect(await send("/api/rooms", "text/plain")).toEqual([415, GATE]);
    expect(await send("/api/rooms", "application/x-www-form-urlencoded")).toEqual([415, GATE]);
    expect(await send("/api/rooms", null)).toEqual([415, GATE]);
    // Better Auth answers 415 for text/plain by itself, so the body shows the gate answered.
    expect(await send("/api/auth/sign-out", "text/plain")).toEqual([415, GATE]);
    // Control: the same request as JSON goes through.
    expect((await send("/api/rooms", "application/json"))[0]).toBe(200);
    expect((await send("/api/rooms", "application/json; charset=utf-8"))[0]).toBe(200);
  });

  it("refuses a form-encoded sign-in that Better Auth alone would accept", async () => {
    const { learner } = await people();
    const email = uniqueEmail("form");
    await (await learner("form-owner")).signUp(email);
    const signIn = async (type: string, body: string) => {
      const browser = new Browser();
      const response = await browser.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": type },
        body,
      });
      return [response.status, await response.json().catch(() => null)];
    };
    const form = new URLSearchParams({ email, password: PASSWORD }).toString();
    expect(await signIn("application/x-www-form-urlencoded", form)).toEqual([415, GATE]);
    // Control: the same credentials as JSON sign in.
    expect((await signIn("application/json", JSON.stringify({ email, password: PASSWORD })))[0]).toBe(200);
  });
});

describe("join attempt window", () => {
  it(`allows ${JOIN_LIMIT} in a window, refuses the next, and starts again in the next window`, async () => {
    const { learner } = await people();
    await learner("window");
    const user = await env.DB.prepare("select id from \"user\" where email like 'window-%'").first<{ id: string }>();
    const id = user!.id;
    const t0 = 1_000_000;
    for (let i = 0; i < JOIN_LIMIT; i++) expect((await takeJoinAttempt(env.DB, id, t0 + i)).allowed).toBe(true);
    expect(await takeJoinAttempt(env.DB, id, t0 + JOIN_WINDOW_MS - 1)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect((await takeJoinAttempt(env.DB, id, t0 + JOIN_WINDOW_MS)).allowed).toBe(true);
  });
});
