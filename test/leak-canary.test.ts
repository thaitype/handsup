/**
 * AC9, the leak canary (HTTP channels). Learner B must learn nothing about a private
 * question from the snapshot or from the responses to B's own writes, in any phase.
 * "Nothing" only counts when the same response carries that phase's public marker.
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

const marker = (label: string) => `${label}-${crypto.randomUUID()}`;

describe("AC9 leak canary over HTTP", () => {
  it("keeps private questions from another learner in every phase", { timeout: 60_000 }, async () => {
    const { room, instructor, member, stub } = await classroom("Canary");
    const api = roomApi(room.id);
    const a = await member("A");
    let b = await member("B");
    // Asks only privately, so this name has no public question that could explain seeing it.
    const ghost = await member("Ghost", marker("GhostName"));

    const secret = { a: marker("PRIVATE-A"), ghost: marker("PRIVATE-GHOST"), answerA: marker("ANSWER-A"), answerGhost: marker("ANSWER-GHOST") };
    const askedA = await questionFrom(await api.ask(a.browser, secret.a, "private"));
    const askedGhost = await questionFrom(await api.ask(ghost.browser, secret.ghost, "private"));
    const secrets = [secret.a, secret.ghost, ghost.name, askedA.id, askedGhost.id];

    let phases = 0;
    /**
     * Runs the checks for one phase. `hidden` is a private text that A (if still there) or the
     * instructor must still see, which proves there was something to leak.
     */
    const check = async (phase: string, hidden: { forA: string | null; forInstructor: string }) => {
      const control = marker(`PUBLIC-${phase}`);
      await questionFrom(await api.ask(a.browser, control, "public"));

      const own = marker(`B-OWN-${phase}`);
      const channels = {
        "B snapshot": await everything(await api.snapshot(b.browser)),
        "B write response": await everything(await api.ask(b.browser, own, "public")),
        "B refused write": await everything(await api.removeQuestion(b.browser, askedGhost.id)),
      };
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

    await check("ask", { forA: secret.a, forInstructor: secret.ghost });

    const answeredA = await questionFrom(await api.answer(instructor, askedA.id, secret.answerA));
    const answeredGhost = await questionFrom(await api.answer(instructor, askedGhost.id, secret.answerGhost));
    const answerA = answeredA.answers[0]!.id;
    secrets.push(secret.answerA, secret.answerGhost, answerA, answeredGhost.answers[0]!.id);
    await check("answer", { forA: secret.answerA, forInstructor: secret.answerGhost });

    await questionFrom(await api.resolve(instructor, askedA.id));
    await questionFrom(await api.resolve(instructor, askedGhost.id));
    await check("resolve", { forA: secret.a, forInstructor: secret.ghost });

    await questionFrom(await api.removeAnswer(instructor, askedA.id, answerA));
    await check("delete answer", { forA: secret.a, forInstructor: secret.answerGhost });

    expect((await api.removeQuestion(a.browser, askedA.id)).status).toBe(200);
    await check("delete question", { forA: null, forInstructor: secret.ghost });

    const again = new Browser();
    expect((await again.signIn(b.email)).status).toBe(200);
    b = { ...b, browser: again };
    await check("fresh sign-in", { forA: null, forInstructor: secret.ghost });

    // The eviction is shown to have happened: a value held only in memory is gone.
    await runInDurableObject(stub, (object) => {
      (object as unknown as { marker?: string }).marker = "before";
    });
    await evictDurableObject(stub);
    expect(await runInDurableObject(stub, (object) => (object as unknown as { marker?: string }).marker)).toBeUndefined();
    await check("after eviction", { forA: null, forInstructor: secret.ghost });

    expect(phases).toBe(7);
    expect((await snapshotFrom(await api.snapshot(b.browser))).questions.every((q) => q.visibility === "public")).toBe(true);
  });
});
