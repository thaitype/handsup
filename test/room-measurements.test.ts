/**
 * Spec section 14: rows the room's SQLite reads and writes per operation, and the time a
 * snapshot takes. Local workerd on this machine. The assertions only prove the instruments.
 */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { classroom } from "./support/classroom.ts";
import type { RoomDO } from "../src/worker/room-do.ts";

const teacher = { id: "teacher", name: "Teacher", email: "teacher@example.test" };
const learner = { id: "learner", name: "Learner", email: "learner@example.test" };

type Rows = { statements: number; rowsRead: number; rowsWritten: number };

/** Counts the rows of every statement run on this object while `work` runs. */
function counting(state: DurableObjectState, work: () => void): Rows {
  const sql = state.storage.sql;
  const original = sql.exec;
  const cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];
  sql.exec = ((query: string, ...bindings: unknown[]) => {
    const cursor = original.call(sql, query, ...bindings);
    cursors.push(cursor);
    return cursor;
  }) as typeof sql.exec;
  try {
    work();
  } finally {
    sql.exec = original;
  }
  // Read after the work: a cursor's counts are final once it has been consumed.
  return {
    statements: cursors.length,
    rowsRead: cursors.reduce((sum, c) => sum + c.rowsRead, 0),
    rowsWritten: cursors.reduce((sum, c) => sum + c.rowsWritten, 0),
  };
}

/** `questions` questions with one answer each, half of them private. */
function seed(state: DurableObjectState, questions: number) {
  state.storage.transactionSync(() => {
    for (let i = 0; i < questions; i++) {
      const id = crypto.randomUUID();
      state.storage.sql.exec(
        `insert into question (id, author_id, author_name, visibility, body, created_at, client_request_id)
         values (?, ?, 'Seed Learner', ?, ?, ?, ?)`,
        id,
        i % 2 === 0 ? "learner" : "other",
        i % 4 < 2 ? "public" : "private",
        "ก".repeat(200),
        i,
        `q${i}`,
      );
      state.storage.sql.exec(
        `insert into answer (id, question_id, author_id, author_name, body, created_at, client_request_id)
         values (?, ?, 'teacher', 'Teacher', ?, ?, ?)`,
        crypto.randomUUID(),
        id,
        "ก".repeat(200),
        i,
        `a${i}`,
      );
    }
  });
}

/** workerd holds the clock still between I/O, so each reading follows a D1 round trip. */
async function now() {
  await env.DB.prepare("select 1").all();
  return Date.now();
}

describe("room measurements", () => {
  it.each([200, 999])("with %i questions and as many answers", { timeout: 120_000 }, async (size) => {
    const { room, stub } = await classroom(`Measure ${size}`);
    await runInDurableObject(stub, (_o, state) => seed(state, size));
    const report: Record<string, Rows> = {};
    await runInDurableObject(stub, (object: RoomDO, state) => {
      let asked = "";
      let answer = "";
      const run = (label: string, work: () => { ok: boolean } | object) => {
        report[label] = counting(state, () => {
          const outcome = work();
          if ("ok" in outcome && !outcome.ok) throw new Error(`${label} failed`);
        });
      };
      // Control: doing nothing counts nothing.
      run("nothing", () => ({}));
      run("snapshot (instructor)", () => object.snapshot(teacher, room));
      run("snapshot (learner)", () => object.snapshot(learner, room));
      run("post", () => {
        const outcome = object.ask(learner, { body: "x", visibility: "public", clientRequestId: "new" });
        if (outcome.ok) asked = outcome.question.id;
        return outcome;
      });
      run("answer", () => {
        const outcome = object.answer(teacher, asked, { body: "x", clientRequestId: "new" });
        if (outcome.ok) answer = outcome.question.answers[0]!.id;
        return outcome;
      });
      run("resolve", () => object.setResolved(teacher, asked, true));
      run("delete answer", () => object.deleteAnswer(teacher, asked, answer));
      run("delete question", () => object.deleteQuestion(teacher, asked));
    });
    for (const [label, rows] of Object.entries(report)) {
      console.log(`MEASURE DO ${size}q+${size}a ${label}`, JSON.stringify(rows));
    }
    expect(report.nothing).toEqual({ statements: 0, rowsRead: 0, rowsWritten: 0 });
    expect(report["snapshot (instructor)"]!.rowsRead).toBeGreaterThanOrEqual(size * 2);
    expect(report.post!.rowsWritten).toBeGreaterThan(0);

    // A snapshot is synchronous work in the object (query, filter, serialize), so on an
    // otherwise idle runtime its wall time stands in for its CPU time.
    for (const [label, identity] of [["instructor", teacher], ["learner", learner]] as const) {
      const batches: number[] = [];
      let bytes = 0;
      const runs = 20;
      for (let batch = 0; batch < 7; batch++) {
        const start = await now();
        bytes = await runInDurableObject(stub, (object: RoomDO) => {
          let length = 0;
          for (let i = 0; i < runs; i++) length = JSON.stringify(object.snapshot(identity, room)).length;
          return length;
        });
        batches.push(((await now()) - start) / runs);
      }
      batches.sort((a, b) => a - b);
      console.log(
        `MEASURE DO ${size}q+${size}a snapshot time (${label})`,
        JSON.stringify({ msPerSnapshot: { min: batches[0], median: batches[3], max: batches[6] }, characters: bytes }),
      );
      expect(batches[3]).toBeGreaterThan(0);
    }
  });
});
