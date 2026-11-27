import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ALPHABET } from "../src/worker/invite-code.ts";
import { JOIN_LIMIT } from "../src/worker/rooms.ts";
import { people, roomIds, type Room } from "./support/people.ts";

const CODE = new RegExp(`^[${ALPHABET}]{10}$`);

describe("AC6: creating rooms", () => {
  it("lets an instructor create a room with a 10-character code and refuses a learner", async () => {
    const { instructor, learner } = await people();
    const created = await instructor.fetch("/api/rooms", { name: "  Algebra 1  " });
    expect(created.status).toBe(200);
    const room = (await created.json()) as Room;
    expect(room).toMatchObject({ name: "Algebra 1" });
    expect(room.inviteCode).toMatch(CODE);

    const student = await learner();
    const refused = await student.fetch("/api/rooms", { name: "Mine" });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "forbidden" });
    const { results } = await env.DB.prepare("select name from room where name = 'Mine'").all();
    expect(results).toEqual([]);
  });

  it("refuses a guest", async () => {
    const { guest, instructor } = await people();
    expect((await guest.fetch("/api/rooms", { name: "Nope" })).status).toBe(401);
    expect((await instructor.fetch("/api/rooms", { name: "Yes" })).status).toBe(200);
  });

  it("draws codes from the whole alphabet and never reuses one", async () => {
    const { createRoom } = await people();
    const codes = await Promise.all(Array.from({ length: 40 }, (_, i) => createRoom(`R${i}`)));
    const seen = new Set(codes.map((room) => room.inviteCode));
    expect(seen.size).toBe(40);
    const characters = new Set([...seen].join(""));
    // 400 random characters cover nearly all of the 32; none outside the alphabet.
    expect(characters.size).toBeGreaterThan(25);
    for (const character of characters) expect(ALPHABET).toContain(character);
  });
});

describe("AC4: POST /api/rooms follows the instructor list", () => {
  it("answers the same session 403 off the list, 200 on it, and 403 with an empty list", async () => {
    const { list, instructor, instructorEmail } = await people();
    expect((await instructor.fetch("/api/rooms", { name: "On" })).status).toBe(200);
    list.value = "someone.else@example.test";
    expect((await instructor.fetch("/api/rooms", { name: "Off" })).status).toBe(403);
    list.value = "";
    expect((await instructor.fetch("/api/rooms", { name: "Empty" })).status).toBe(403);
    list.value = instructorEmail.toUpperCase();
    expect((await instructor.fetch("/api/rooms", { name: "Back" })).status).toBe(200);
    const verified = await env.DB.prepare('select emailVerified from "user" where email = ?')
      .bind(instructorEmail)
      .first<{ emailVerified: number }>();
    expect(verified?.emailVerified).toBe(0);
  });
});

describe("AC7: joining", () => {
  it("joins with the code, lists the room for the member only, and joining again is plain success", async () => {
    const { createRoom, learner } = await people();
    const room = await createRoom("Physics");
    const member = await learner("member");
    const outsider = await learner("outsider");

    expect(await roomIds(member)).toEqual([]);
    const joined = await member.fetch("/api/join", { code: room.inviteCode });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ room: { id: room.id, name: "Physics" } });
    expect(await roomIds(member)).toEqual([room.id]);
    expect(await roomIds(outsider)).toEqual([]);

    const again = await member.fetch("/api/join", { code: room.inviteCode });
    expect(again.status).toBe(200);
    expect(await roomIds(member)).toEqual([room.id]);
  });

  it.each([
    ["lower case", (c: string) => c.toLowerCase()],
    ["spaces and hyphens", (c: string) => `${c.slice(0, 3)} - ${c.slice(3, 7)}-${c.slice(7)} `],
    ["O for 0, I and L for 1", (c: string) => c.replaceAll("0", "O").replace("1", "I").replace("1", "l")],
  ])("reads a code typed in %s", async (_, typed) => {
    const { createRoom, learner } = await people();
    // A code with 0 and 1 in it, so the look-alike rule is really exercised.
    let room = await createRoom();
    while (!/0.*1|1.*0/.test(room.inviteCode)) room = await createRoom();
    const student = await learner();
    const response = await student.fetch("/api/join", { code: typed(room.inviteCode) });
    expect(response.status).toBe(200);
    expect(await roomIds(student)).toEqual([room.id]);
  });

  it("gives every wrong code the same answer, while the right code works", async () => {
    const { createRoom, learner } = await people();
    const room = await createRoom();
    const student = await learner();
    const wrongs = [
      "0000000000",
      room.inviteCode.slice(0, 9),
      `${room.inviteCode}0`,
      room.inviteCode.replace(/./, (ch) => (ch === "U" ? "V" : "U")),
      "",
      "!!!!!!!!!!",
    ];
    const answers = new Set<string>();
    for (const code of wrongs) {
      const response = await student.fetch("/api/join", { code });
      answers.add(`${response.status} ${await response.text()}`);
    }
    expect([...answers]).toEqual(['400 {"error":"invalid_code"}']);
    expect((await student.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);
  });

  it("stops the old code after a rotation, takes the new one, and keeps existing members", async () => {
    const { instructor, createRoom, learner } = await people();
    const room = await createRoom();
    const early = await learner("early");
    expect((await early.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);

    const rotated = await instructor.fetch(`/api/rooms/${room.id}/invite-code/rotate`, {});
    expect(rotated.status).toBe(200);
    const { inviteCode } = (await rotated.json()) as { inviteCode: string };
    expect(inviteCode).toMatch(CODE);
    expect(inviteCode).not.toBe(room.inviteCode);

    const late = await learner("late");
    expect((await late.fetch("/api/join", { code: room.inviteCode })).status).toBe(400);
    expect((await late.fetch("/api/join", { code: inviteCode })).status).toBe(200);
    expect(await roomIds(early)).toEqual([room.id]);
    expect(await roomIds(late)).toEqual([room.id]);
  });

  it(`limits joins to ${JOIN_LIMIT} a minute per user, without touching another user`, async () => {
    const { createRoom, learner } = await people();
    const room = await createRoom();
    const busy = await learner("busy");
    const other = await learner("other");
    for (let i = 0; i < JOIN_LIMIT; i++) {
      expect((await busy.fetch("/api/join", { code: "0000000000" })).status).toBe(400);
    }
    const limited = await busy.fetch("/api/join", { code: room.inviteCode });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await roomIds(busy)).toEqual([]);
    // Control: another user in the same minute is not limited.
    expect((await other.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);
  });

  it("lets an instructor use a code without becoming a member", async () => {
    const { instructor, createRoom } = await people();
    const room = await createRoom();
    expect((await instructor.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);
    const { results } = await env.DB.prepare("select user_id from room_member where room_id = ?")
      .bind(room.id)
      .all();
    expect(results).toEqual([]);
  });
});
