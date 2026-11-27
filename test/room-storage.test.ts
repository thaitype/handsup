/** Spec 5: what the room object stores, and that it survives eviction. */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { classroom, questionFrom, roomApi, snapshotFrom } from "./support/classroom.ts";

const count = (state: DurableObjectState, table: "question" | "answer") =>
  state.storage.sql.exec<{ n: number }>(`select count(*) as n from ${table}`).one().n;

describe("room storage", () => {
  it("creates its schema once, keeps data across eviction, and uses random ids", async () => {
    const { room, instructor, member, stub } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const ids = [];
    for (const body of ["one", "two", "three"]) ids.push((await questionFrom(await api.ask(a.browser, body, "private"))).id);
    const answered = await questionFrom(await api.answer(instructor, ids[0]!, "answer"));
    for (const id of [...ids, answered.answers[0]!.id]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    const versions = () =>
      runInDurableObject(stub, (_o, state) =>
        state.storage.sql.exec("select version from schema_version order by version").toArray(),
      );
    expect(await versions()).toEqual([{ version: 1 }]);
    await evictDurableObject(stub);
    expect((await snapshotFrom(await api.snapshot(a.browser))).questions.map((q) => q.body)).toEqual(["one", "two", "three"]);
    expect(await versions()).toEqual([{ version: 1 }]);
    // Every row carries the asker's name (spec 5), private ones included.
    const names = await runInDurableObject(stub, (_o, state) =>
      state.storage.sql.exec("select distinct author_name from question").toArray(),
    );
    expect(names).toEqual([{ author_name: a.name }]);
  });

  it("deletes a question and its answers in one transaction", async () => {
    const { room, instructor, member, stub } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const asked = await questionFrom(await api.ask(a.browser, "q"));
    await questionFrom(await api.answer(instructor, asked.id, "one"));
    await questionFrom(await api.answer(instructor, asked.id, "two"));
    // Make the second delete fail, after the answers have already been deleted.
    await runInDurableObject(stub, (_o, state) => {
      state.storage.sql.exec(
        "create trigger refuse before delete on question begin select raise(abort, 'refused'); end",
      );
    });
    const failure = await runInDurableObject(stub, (object) => {
      try {
        object.deleteQuestion({ id: "x", name: "x", email: "teacher@example.test" }, asked.id);
        return "deleted";
      } catch (error) {
        return String(error);
      }
    });
    expect(failure).toContain("refused");
    expect(await runInDurableObject(stub, (_o, state) => [count(state, "question"), count(state, "answer")])).toEqual([1, 2]);
    // Control: without the obstacle, both go.
    await runInDurableObject(stub, (_o, state) => {
      state.storage.sql.exec("drop trigger refuse");
    });
    expect((await api.removeQuestion(instructor, asked.id)).status).toBe(200);
    expect(await runInDurableObject(stub, (_o, state) => [count(state, "question"), count(state, "answer")])).toEqual([0, 0]);
  });
});
