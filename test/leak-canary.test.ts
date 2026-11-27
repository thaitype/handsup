/**
 * AC9, the leak canary. Learner B must learn nothing about a private question, in any phase,
 * from any of the three exits: the socket, the HTTP snapshot and the responses to B's own
 * writes. "Nothing" only counts when the same channel carries that phase's public marker.
 */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  classroom,
  everything,
  questionFrom,
  roomApi,
  snapshotFrom,
} from "./support/classroom.ts";
import { Browser } from "./support/http.ts";
import { connect } from "./support/socket.ts";

const marker = (label: string) => `${label}-${crypto.randomUUID()}`;

describe("AC9 leak canary over the socket and HTTP", () => {
  it("keeps private questions from another learner in every phase", { timeout: 60_000 }, async () => {
    const { room, instructor, member, stub } = await classroom("Canary");
    const api = roomApi(room.id);
    const a = await member("A");
    let b = await member("B");
    // Asks only privately, so this name has no public question that could explain seeing it.
    const ghost = await member("Ghost", marker("GhostName"));

    // B listens before anything private is posted.
    let socketB = await connect(b.browser, room.id);
    let socketA = await connect(a.browser, room.id);
    let socketInstructor = await connect(instructor, room.id);
    /** Where this phase's frames start on each socket. */
    let from = { b: socketB.frames.length, a: socketA.frames.length, i: socketInstructor.frames.length };

    const secret = { a: marker("PRIVATE-A"), ghost: marker("PRIVATE-GHOST"), answerA: marker("ANSWER-A"), answerGhost: marker("ANSWER-GHOST") };
    const askedA = await questionFrom(await api.ask(a.browser, secret.a, "private"));
    const askedGhost = await questionFrom(await api.ask(ghost.browser, secret.ghost, "private"));
    const secrets = [secret.a, secret.ghost, ghost.name, askedA.id, askedGhost.id];

    let phases = 0;
    /**
     * Runs the checks for one phase. `hidden` is a private text that A (if still there) or the
     * instructor must still see, which proves there was something to leak.
     */
    const check = async (
      phase: string,
      hidden: { forA: string | null; forInstructor: string },
      /** What the private activity of this phase must have sent to A and the instructor. */
      heard: { a: string[]; instructor: string[] } = { a: [], instructor: [] },
    ) => {
      const control = marker(`PUBLIC-${phase}`);
      await questionFrom(await api.ask(a.browser, control, "public"));

      const own = marker(`B-OWN-${phase}`);
      const channels = {
        "B snapshot": await everything(await api.snapshot(b.browser)),
        "B write response": await everything(await api.ask(b.browser, own, "public")),
        "B refused write": await everything(await api.removeQuestion(b.browser, askedGhost.id)),
      };
      // The socket: B must have heard this phase's public events on the very socket checked.
      await socketB.received(control);
      await socketB.received(own);
      const framesB = socketB.frames.slice(from.b);
      for (const item of secrets) expect(socketB.frames.join(), `${phase}: B socket leaks ${item}`).not.toContain(item);
      // Nothing at all from private activity: every frame is the snapshot or one of the
      // two public posts of this phase.
      for (const frame of framesB) {
        expect(frame.includes('"type":"snapshot"') || frame.includes(control) || frame.includes(own), `${phase}: ${frame}`).toBe(true);
      }
      for (const text of heard.a) await socketA.received(text);
      for (const text of heard.instructor) await socketInstructor.received(text);
      const sinceA = socketA.frames.slice(from.a).join();
      const sinceInstructor = socketInstructor.frames.slice(from.i).join();
      for (const text of heard.a) expect(sinceA, `${phase}: asker socket`).toContain(text);
      for (const text of heard.instructor) expect(sinceInstructor, `${phase}: instructor socket`).toContain(text);
      expect(socketA.frames.join(), `${phase}: A socket sees the ghost`).not.toContain(secret.ghost);
      expect(socketB.closes, phase).toEqual([]);
      from = { b: socketB.frames.length, a: socketA.frames.length, i: socketInstructor.frames.length };

      // Controls: the same channels carry what B is allowed to see.
      expect(channels["B snapshot"].body, `${phase}: control`).toContain(control);
      expect(channels["B write response"].body, `${phase}: control`).toContain(own);
      expect(channels["B refused write"].status, phase).toBe(404);
      for (const [channel, seen] of Object.entries(channels)) {
        for (const item of secrets) expect(seen.all, `${phase}: ${channel} leaks ${item}`).not.toContain(item);
      }

      const instructorSees = await everything(await api.snapshot(instructor));
      expect(instructorSees.body, `${phase}: instructor`).toContain(hidden.forInstructor);
      expect(instructorSees.body, `${phase}: instructor`).toContain(control);
      const aSees = await everything(await api.snapshot(a.browser));
      if (hidden.forA) expect(aSees.body, `${phase}: asker`).toContain(hidden.forA);
      // A is another learner as far as the ghost's question goes.
      for (const item of [secret.ghost, ghost.name, askedGhost.id, secret.answerGhost]) {
        expect(aSees.all, `${phase}: A sees the ghost`).not.toContain(item);
      }
      phases++;
    };

    await check("ask", { forA: secret.a, forInstructor: secret.ghost }, { a: [secret.a], instructor: [secret.a, secret.ghost, ghost.name] });

    const answeredA = await questionFrom(await api.answer(instructor, askedA.id, secret.answerA));
    const answeredGhost = await questionFrom(await api.answer(instructor, askedGhost.id, secret.answerGhost));
    const answerA = answeredA.answers[0]!.id;
    secrets.push(secret.answerA, secret.answerGhost, answerA, answeredGhost.answers[0]!.id);
    await check("answer", { forA: secret.answerA, forInstructor: secret.answerGhost }, { a: [secret.answerA], instructor: [secret.answerA, secret.answerGhost] });

    await questionFrom(await api.resolve(instructor, askedA.id));
    await questionFrom(await api.resolve(instructor, askedGhost.id));
    await check("resolve", { forA: secret.a, forInstructor: secret.ghost }, { a: [askedA.id], instructor: [askedA.id, askedGhost.id] });

    await questionFrom(await api.removeAnswer(instructor, askedA.id, answerA));
    await check("delete answer", { forA: secret.a, forInstructor: secret.answerGhost }, { a: [askedA.id], instructor: [askedA.id] });

    expect((await api.removeQuestion(a.browser, askedA.id)).status).toBe(200);
    const removed = `"question.remove","questionId":"${askedA.id}"`;
    await check("delete question", { forA: null, forInstructor: secret.ghost }, { a: [removed], instructor: [removed] });

    // Reconnect: every socket drops and comes back.
    socketB.socket.close(1000);
    socketA.socket.close(1000);
    socketInstructor.socket.close(1000);
    socketB = await connect(b.browser, room.id);
    socketA = await connect(a.browser, room.id);
    socketInstructor = await connect(instructor, room.id);
    from = { b: 0, a: 0, i: 0 };
    await check("reconnect", { forA: null, forInstructor: secret.ghost }, { a: [], instructor: [secret.ghost] });

    const again = new Browser();
    expect((await again.signIn(b.email)).status).toBe(200);
    b = { ...b, browser: again };
    socketB.socket.close(1000);
    socketB = await connect(b.browser, room.id);
    from = { ...from, b: 0 };
    await check("fresh sign-in", { forA: null, forInstructor: secret.ghost });

    // The eviction is shown to have happened: a value held only in memory is gone.
    await runInDurableObject(stub, (object) => {
      (object as unknown as { marker?: string }).marker = "before";
    });
    await evictDurableObject(stub);
    expect(await runInDurableObject(stub, (object) => (object as unknown as { marker?: string }).marker)).toBeUndefined();
    // The same sockets, with private activity after the eviction.
    const late = await questionFrom(await api.ask(ghost.browser, marker("PRIVATE-LATE"), "private"));
    secrets.push(late.body, late.id);
    await check("after eviction", { forA: null, forInstructor: late.body }, { a: [], instructor: [late.body, ghost.name] });

    expect(phases).toBe(8);
    for (const s of [socketA, socketB, socketInstructor]) s.socket.close(1000);
    expect((await snapshotFrom(await api.snapshot(b.browser))).questions.every((q) => q.visibility === "public")).toBe(true);
  });
});
