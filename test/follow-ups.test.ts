/** The thread under a question: the asker and instructors write in it, nobody else. */
import { describe, expect, it } from "vitest";
import { POST_LIMIT } from "../src/shared/protocol.ts";
import {
  classroom,
  everything,
  questionFrom,
  resetPostLimit,
  roomApi,
  snapshotFrom,
} from "./support/classroom.ts";
import { connect } from "./support/socket.ts";

describe("follow-ups", () => {
  it("makes one thread in time order, marking instructors and keeping the name rule", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    for (const visibility of ["public", "private"] as const) {
      await resetPostLimit();
      const asked = await questionFrom(await api.ask(a.browser, `${visibility} q`, visibility));
      await questionFrom(await api.answer(instructor, asked.id, "answer"));
      const mine = await questionFrom(await api.answer(a.browser, asked.id, "and then?"));
      await questionFrom(await api.answer(instructor, asked.id, "more"));
      const hidden = visibility === "private";
      expect(mine.answers.map((m) => [m.body, m.authorName, m.fromInstructor, m.isMine])).toEqual([
        ["answer", "Instructor Ida", true, false],
        ["and then?", hidden ? null : a.name, false, true],
      ]);
      const view = async (who: typeof instructor) =>
        (await snapshotFrom(await api.snapshot(who))).questions.find((q) => q.id === asked.id);
      expect((await view(instructor))!.answers.map((m) => [m.body, m.authorName, m.fromInstructor, m.isMine])).toEqual([
        ["answer", "Instructor Ida", true, true],
        ["and then?", a.name, false, false],
        ["more", "Instructor Ida", true, true],
      ]);
      const forB = await view(b.browser);
      if (hidden) expect(forB).toBeUndefined();
      else expect(forB!.answers.map((m) => [m.authorName, m.isMine])).toEqual([["Instructor Ida", false], [a.name, false], ["Instructor Ida", false]]);
      // A follow-up leaves the resolved state as it was.
      await questionFrom(await api.resolve(instructor, asked.id));
      expect((await questionFrom(await api.answer(a.browser, asked.id, "after resolved"))).resolvedAt).not.toBeNull();
    }
  });

  it("refuses everyone else without revealing a private question", async () => {
    const { room, guest, member, outsider } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    const out = await outsider("Out");
    const open = await questionFrom(await api.ask(a.browser, "open"));
    const hidden = await questionFrom(await api.ask(a.browser, "hidden", "private"));
    const onSocket = await connect(a.browser, room.id);

    const onPublic = await api.answer(b.browser, open.id, "intruding");
    expect([onPublic.status, await onPublic.json()]).toEqual([403, { error: "forbidden" }]);
    const onPrivate = await everything(await api.answer(b.browser, hidden.id, "intruding"));
    expect(onPrivate.status).toBe(404);
    expect(onPrivate.all).toBe((await everything(await api.answer(b.browser, crypto.randomUUID(), "intruding"))).all);
    expect((await api.answer(out.browser, open.id, "x")).status).toBe(404);
    expect((await api.answer(guest, open.id, "x")).status).toBe(401);
    // A role or an author sent by the client is refused as an unknown field.
    const forged = await b.browser.fetch(`/api/rooms/${room.id}/questions/${open.id}/answers`, {
      body: "x",
      clientRequestId: "f1",
      fromInstructor: true,
    });
    expect(forged.status).toBe(400);
    expect((await snapshotFrom(await api.snapshot(a.browser))).questions.flatMap((q) => q.answers)).toEqual([]);
    // Control: the asker writes in both.
    for (const id of [open.id, hidden.id]) expect((await api.answer(a.browser, id, "mine")).status).toBe(200);
    onSocket.socket.close(1000);
  });

  it("follows the answer rules for length, retries, rate, origin and deletion", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const asked = await questionFrom(await api.ask(a.browser, "q"));
    expect((await api.answer(a.browser, asked.id, "  ")).status).toBe(400);
    expect((await api.answer(a.browser, asked.id, "x".repeat(4001))).status).toBe(400);
    await resetPostLimit();
    const key = crypto.randomUUID();
    await questionFrom(await api.answer(a.browser, asked.id, "once", key));
    expect((await questionFrom(await api.answer(a.browser, asked.id, "once", key))).answers).toHaveLength(1);
    const elsewhere = await a.browser.request(
      `/api/rooms/${room.id}/questions/${asked.id}/answers`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "x", clientRequestId: "o" }) },
      "https://evil.example",
    );
    expect(elsewhere.status).toBe(403);
    await resetPostLimit();
    for (let i = 0; i < POST_LIMIT; i++) expect((await api.answer(a.browser, asked.id, `n${i}`)).status).toBe(200);
    expect((await api.answer(a.browser, asked.id, "too many")).status).toBe(429);

    await resetPostLimit();
    const thread = await questionFrom(await api.answer(instructor, asked.id, "instructor says"));
    const own = thread.answers[0]!.id;
    const theirs = thread.answers.at(-1)!.id;
    expect((await api.removeAnswer(a.browser, asked.id, theirs)).status).toBe(403);
    expect((await api.removeAnswer(a.browser, asked.id, own)).status).toBe(200);
    expect((await api.removeAnswer(instructor, asked.id, thread.answers[1]!.id)).status).toBe(200);
    // Deleting the question takes the thread with it.
    expect((await api.removeQuestion(a.browser, asked.id)).status).toBe(200);
    expect((await snapshotFrom(await api.snapshot(instructor))).questions).toEqual([]);
  });
});
