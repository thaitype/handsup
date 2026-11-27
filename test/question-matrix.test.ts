/**
 * AC12, the question and answer rows of the spec 6.1 matrix, in one table. Every action has
 * cells that are allowed and cells that are refused, run in the same test.
 */
import { describe, expect, it } from "vitest";
import { classroom, questionFrom, resetPostLimit, roomApi, snapshotFrom } from "./support/classroom.ts";
import type { Browser } from "./support/http.ts";

type Who = "guest" | "learner, not a member" | "other member" | "asker" | "instructor";
const WHO: Who[] = ["guest", "learner, not a member", "other member", "asker", "instructor"];

describe("AC12: question actions by role (spec 6.1)", () => {
  it("allows and refuses each action with the status spec 6.2 names", async () => {
    const { room, guest, instructor, member, outsider } = await classroom();
    const api = roomApi(room.id);
    const asker = await member("Asker");
    const other = await member("Other");
    const outside = await outsider("Outside");
    const as: Record<Who, Browser> = {
      guest,
      "learner, not a member": outside.browser,
      "other member": other.browser,
      asker: asker.browser,
      instructor,
    };
    // Fresh targets, so one cell cannot use up another's.
    const fresh = async (visibility: "public" | "private") =>
      (await questionFrom(await api.ask(asker.browser, `${visibility} ${crypto.randomUUID()}`, visibility))).id;
    const open = await fresh("public");
    const hidden = await fresh("private");
    await questionFrom(await api.answer(instructor, open, "answer"));
    const sees = async (b: Browser, qid: string) => {
      const response = await api.snapshot(b);
      if (response.status !== 200) return response.status;
      return (await snapshotFrom(response)).questions.some((q) => q.id === qid) ? 200 : "absent";
    };

    type Row = { name: string; expected: Record<Who, number | "absent">; run: (b: Browser) => Promise<number | "absent"> };
    const rows: Row[] = [
      {
        name: "read the snapshot",
        expected: { guest: 401, "learner, not a member": 404, "other member": 200, asker: 200, instructor: 200 },
        run: async (b) => (await api.snapshot(b)).status,
      },
      {
        name: "see a public question",
        expected: { guest: 401, "learner, not a member": 404, "other member": 200, asker: 200, instructor: 200 },
        run: (b) => sees(b, open),
      },
      {
        name: "see a private question",
        expected: { guest: 401, "learner, not a member": 404, "other member": "absent", asker: 200, instructor: 200 },
        run: (b) => sees(b, hidden),
      },
      {
        name: "ask",
        expected: { guest: 401, "learner, not a member": 404, "other member": 200, asker: 200, instructor: 403 },
        run: async (b) => (await api.ask(b, "new")).status,
      },
      {
        name: "answer",
        expected: { guest: 401, "learner, not a member": 403, "other member": 403, asker: 403, instructor: 200 },
        run: async (b) => (await api.answer(b, open, "a")).status,
      },
      {
        name: "mark resolved",
        expected: { guest: 401, "learner, not a member": 403, "other member": 403, asker: 403, instructor: 200 },
        run: async (b) => (await api.resolve(b, open)).status,
      },
      {
        name: "delete an answer",
        expected: { guest: 401, "learner, not a member": 403, "other member": 403, asker: 403, instructor: 200 },
        run: async (b) => {
          const answered = await questionFrom(await api.answer(instructor, open, "to delete"));
          return (await api.removeAnswer(b, open, answered.answers.at(-1)!.id)).status;
        },
      },
      {
        name: "delete a public question",
        expected: { guest: 401, "learner, not a member": 404, "other member": 403, asker: 200, instructor: 200 },
        run: async (b) => (await api.removeQuestion(b, await fresh("public"))).status,
      },
      {
        name: "delete a private question",
        expected: { guest: 401, "learner, not a member": 404, "other member": 404, asker: 200, instructor: 200 },
        run: async (b) => (await api.removeQuestion(b, await fresh("private"))).status,
      },
    ];

    const counts = { allowed: 0, refused: 0 };
    for (const row of rows) {
      const outcomes = Object.values(row.expected).map((value) => (value === 200 ? "allowed" : "refused"));
      expect(new Set(outcomes), row.name).toEqual(new Set(["allowed", "refused"]));
      for (const who of WHO) {
        // The matrix is about roles; the posting rate has its own test.
        await resetPostLimit();
        expect(await row.run(as[who]), `${row.name} as ${who}`).toBe(row.expected[who]);
        counts[row.expected[who] === 200 ? "allowed" : "refused"]++;
      }
    }
    console.log("COUNT AC12 question rows", JSON.stringify({ actions: rows.length, ...counts }));
    expect(counts).toEqual({ allowed: 17, refused: 28 });
  });
});
