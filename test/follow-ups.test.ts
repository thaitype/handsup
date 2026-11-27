/** The thread under a question: the asker and instructors write in it, nobody else. */
import { runInDurableObject } from "cloudflare:test";
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
    }
  });

  it.each(["public", "private"] as const)(
    "reopens a resolved %s question when the asker writes, and only then",
    async (visibility) => {
      const { room, instructor, member, stub } = await classroom();
      const api = roomApi(room.id);
      const a = await member("A");
      const b = await member("B");
      const asked = await questionFrom(await api.ask(a.browser, "q", visibility));
      const sockets = [await connect(instructor, room.id), await connect(a.browser, room.id), await connect(b.browser, room.id)];
      const state = async () =>
        (await snapshotFrom(await api.snapshot(instructor))).questions.find((q) => q.id === asked.id)!.resolvedAt;
      const resolve = () => api.resolve(instructor, asked.id);

      // An instructor's message leaves it resolved.
      await questionFrom(await resolve());
      expect((await questionFrom(await api.answer(instructor, asked.id, "from the instructor"))).resolvedAt).not.toBeNull();
      expect(await state()).not.toBeNull();

      // The asker's message reopens it, for everyone who may see it, in one event.
      const key = crypto.randomUUID();
      const reopened = await questionFrom(await api.answer(a.browser, asked.id, "still stuck", key));
      expect(reopened.resolvedAt).toBeNull();
      expect(await state()).toBeNull();
      const watchers = visibility === "public" ? sockets : sockets.slice(0, 2);
      for (const socket of watchers) {
        await socket.received("still stuck");
        const event = socket.messages().find((m) => m.type === "question.upsert" && JSON.stringify(m).includes("still stuck"));
        expect(event).toMatchObject({ question: { id: asked.id, resolvedAt: null } });
      }
      if (visibility === "private") {
        // Control: B's socket is alive and heard nothing of this thread.
        await questionFrom(await api.ask(a.browser, "public control"));
        await sockets[2]!.received("public control");
        expect(sockets[2]!.frames.join()).not.toContain("still stuck");
      }

      // Resolved again by the instructor: a retry of the same message must not reopen it.
      await questionFrom(await resolve());
      const retried = await questionFrom(await api.answer(a.browser, asked.id, "still stuck", key));
      expect(retried.resolvedAt).not.toBeNull();
      expect(retried.answers.filter((m) => m.body === "still stuck")).toHaveLength(1);
      expect(await state()).not.toBeNull();
      // Control: a new message does reopen it.
      expect((await questionFrom(await api.answer(a.browser, asked.id, "and again"))).resolvedAt).toBeNull();

      // The message and the reopening happen together or not at all.
      await questionFrom(await resolve());
      await runInDurableObject(stub, (_o, storage) => {
        storage.storage.sql.exec(
          "create trigger refuse before update on question begin select raise(abort, 'refused'); end",
        );
      });
      const before = (await snapshotFrom(await api.snapshot(instructor))).questions.find((q) => q.id === asked.id)!;
      expect((await api.answer(a.browser, asked.id, "must not stay")).status).toBe(500);
      const after = (await snapshotFrom(await api.snapshot(instructor))).questions.find((q) => q.id === asked.id)!;
      expect(after).toEqual(before);
      for (const socket of sockets) socket.socket.close(1000);
    },
  );

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
