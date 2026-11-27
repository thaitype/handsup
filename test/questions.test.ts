/** AC10, AC11, AC13 and the write behaviour of spec 8.5, over HTTP. */
import { describe, expect, it } from "vitest";
import { classroom, everything, questionFrom, roomApi, snapshotFrom } from "./support/classroom.ts";

describe("AC10: who sees the asker of a private question (DEC-1)", () => {
  it("gives the instructor the right name, the asker isMine without a name, and others nothing", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const c = await member("C");
    const b = await member("B");
    const askedA = await questionFrom(await api.ask(a.browser, "private from A", "private"));
    const askedC = await questionFrom(await api.ask(c.browser, "private from C", "private"));
    const open = await questionFrom(await api.ask(a.browser, "public from A", "public"));

    // The write response is the asker's own view.
    expect(askedA).toMatchObject({ visibility: "private", authorName: null, isMine: true });

    const seen = async (who: typeof a.browser) => (await snapshotFrom(await api.snapshot(who))).questions;
    const forInstructor = await seen(instructor);
    expect(forInstructor.map((q) => [q.id, q.authorName, q.isMine])).toEqual([
      [askedA.id, a.name, false],
      [askedC.id, c.name, false],
      [open.id, a.name, false],
    ]);
    expect((await seen(a.browser)).map((q) => [q.id, q.authorName, q.isMine])).toEqual([
      [askedA.id, null, true],
      [open.id, a.name, true],
    ]);
    // B: only the public question, named, on the same channel that hides the rest.
    expect((await seen(b.browser)).map((q) => [q.id, q.authorName, q.isMine])).toEqual([[open.id, a.name, false]]);

    // A view never carries the asker's id or email, whoever looks.
    const keys = new Set(forInstructor.flatMap((q) => Object.keys(q)));
    expect([...keys].sort()).toEqual(
      ["answers", "authorName", "body", "createdAt", "id", "isMine", "resolvedAt", "visibility"],
    );
    const raw = (await everything(await api.snapshot(instructor))).body;
    expect(raw).toContain(a.name);
    expect(raw).not.toContain(a.email);
  });

  it("sends the snapshot in the message shape of spec 8.2 with nothing cacheable or cross-origin", async () => {
    const { room, instructor } = await classroom("Shape");
    const response = await instructor.request(`/api/rooms/${room.id}/snapshot`, { method: "GET" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect([...response.headers.keys()].filter((name) => name.startsWith("access-control-"))).toEqual([]);
    expect(await response.json()).toEqual({ v: 1, type: "snapshot", room: { id: room.id, name: "Shape" }, questions: [] });
  });
});

describe("AC11: a question you may not see looks like one that does not exist", () => {
  it("answers byte for byte the same, and the owner can still delete it", async () => {
    const { room, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    const hidden = await questionFrom(await api.ask(a.browser, "hidden", "private"));
    const missing = crypto.randomUUID();
    const answerId = crypto.randomUUID();

    const attempts: [string, (qid: string) => Promise<Response>, number][] = [
      ["delete question", (qid) => api.removeQuestion(b.browser, qid), 404],
      ["answer", (qid) => api.answer(b.browser, qid, "x"), 403],
      ["resolve", (qid) => api.resolve(b.browser, qid), 403],
      ["delete answer", (qid) => api.removeAnswer(b.browser, qid, answerId), 403],
    ];
    for (const [label, attempt, status] of attempts) {
      const onHidden = await everything(await attempt(hidden.id));
      const onMissing = await everything(await attempt(missing));
      expect(onHidden.status, label).toBe(status);
      // Status, every header and the body.
      expect(onHidden.all, label).toBe(onMissing.all);
    }
    // Control: the id is real, and its owner may delete it.
    const owner = await api.removeQuestion(a.browser, hidden.id);
    expect(owner.status).toBe(200);
    expect(await owner.json()).toEqual({ questionId: hidden.id });
  });

  it("answers a room that is missing and a room you are not in the same way", async () => {
    const { room, member, outsider } = await classroom();
    const inside = await member("In");
    const outside = await outsider("Out");
    const missing = crypto.randomUUID();
    for (const call of [
      (id: string) => roomApi(id).snapshot(outside.browser),
      (id: string) => roomApi(id).ask(outside.browser, "x"),
      (id: string) => roomApi(id).removeQuestion(outside.browser, crypto.randomUUID()),
    ]) {
      const real = await everything(await call(room.id));
      expect(real.status).toBe(404);
      expect(real.all).toBe((await everything(await call(missing))).all);
    }
    expect((await roomApi(room.id).snapshot(inside.browser)).status).toBe(200);
  });
});

describe("answers, resolved and delete", () => {
  it("keeps several answers in order, toggles resolved, and deletes", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const asked = await questionFrom(await api.ask(a.browser, "  spaced body \n"));
    expect(asked).toMatchObject({ body: "spaced body", resolvedAt: null, answers: [] });
    await questionFrom(await api.answer(instructor, asked.id, "first"));
    const two = await questionFrom(await api.answer(instructor, asked.id, "second"));
    expect(two.answers.map((x) => [x.body, x.authorName])).toEqual([
      ["first", "Instructor Ida"],
      ["second", "Instructor Ida"],
    ]);
    // Answering does not resolve (spec N5).
    expect(two.resolvedAt).toBeNull();
    const resolved = await questionFrom(await api.resolve(instructor, asked.id, true));
    expect(resolved.resolvedAt).toEqual(expect.any(Number));
    expect((await questionFrom(await api.resolve(instructor, asked.id, true))).resolvedAt).toBe(resolved.resolvedAt);
    expect((await questionFrom(await api.resolve(instructor, asked.id, false))).resolvedAt).toBeNull();
    const one = await questionFrom(await api.removeAnswer(instructor, asked.id, two.answers[0]!.id));
    expect(one.answers.map((x) => x.body)).toEqual(["second"]);
    expect((await api.removeAnswer(instructor, asked.id, two.answers[0]!.id)).status).toBe(404);
    // An answer id under another question is not found, and stays.
    const other = await questionFrom(await api.ask(a.browser, "other"));
    expect((await api.removeAnswer(instructor, other.id, one.answers[0]!.id)).status).toBe(404);
    expect((await snapshotFrom(await api.snapshot(a.browser))).questions[0]!.answers).toHaveLength(1);
    expect((await api.removeQuestion(instructor, asked.id)).status).toBe(200);
    expect((await snapshotFrom(await api.snapshot(a.browser))).questions.map((q) => q.id)).toEqual([other.id]);
  });
});

describe("AC13 over HTTP: retries and resync", () => {
  it("does not create twice for the same clientRequestId, and does for a new one", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    const key = crypto.randomUUID();
    const first = await questionFrom(await api.ask(a.browser, "once", "private", key));
    const retried = await questionFrom(await api.ask(a.browser, "once", "private", key));
    expect(retried.id).toBe(first.id);
    // The key is per author: the same value from someone else is their own question,
    // and tells them nothing about this one.
    const theirs = await questionFrom(await api.ask(b.browser, "mine", "public", key));
    expect(theirs.id).not.toBe(first.id);
    expect(theirs.body).toBe("mine");
    const fresh = await questionFrom(await api.ask(a.browser, "once", "private"));
    expect(fresh.id).not.toBe(first.id);

    const answerKey = crypto.randomUUID();
    await questionFrom(await api.answer(instructor, first.id, "a", answerKey));
    expect((await questionFrom(await api.answer(instructor, first.id, "a", answerKey))).answers).toHaveLength(1);
    expect((await questionFrom(await api.answer(instructor, first.id, "a"))).answers).toHaveLength(2);

    const all = (await snapshotFrom(await api.snapshot(instructor))).questions;
    expect(all.map((q) => q.id)).toEqual([first.id, theirs.id, fresh.id]);
    // A later snapshot no longer holds what was deleted in between.
    expect((await api.removeQuestion(instructor, first.id)).status).toBe(200);
    expect((await snapshotFrom(await api.snapshot(instructor))).questions.map((q) => q.id)).toEqual([theirs.id, fresh.id]);
  });
});

describe("request bodies on question writes (spec 8.5)", () => {
  it("rejects unknown fields and wrong shapes, and takes the exact ones", async () => {
    const { room, instructor, member } = await classroom();
    const a = await member("A");
    const api = roomApi(room.id);
    const asked = await questionFrom(await api.ask(a.browser, "q"));
    const base = `/api/rooms/${room.id}/questions`;
    const ok = { body: "x", visibility: "public", clientRequestId: "k1" };
    const cases: [typeof instructor, "POST" | "PUT", string, unknown][] = [
      [a.browser, "POST", base, { ...ok, authorName: "Someone" }],
      [a.browser, "POST", base, { ...ok, visibility: "anonymous" }],
      [a.browser, "POST", base, { body: "x", clientRequestId: "k" }],
      [a.browser, "POST", base, { body: "x", visibility: "public" }],
      [a.browser, "POST", base, { ...ok, clientRequestId: "k".repeat(65) }],
      [a.browser, "POST", base, { ...ok, body: 7 }],
      [instructor, "POST", `${base}/${asked.id}/answers`, { body: "x", clientRequestId: "k", resolved: true }],
      [instructor, "PUT", `${base}/${asked.id}/resolved`, { resolved: "yes" }],
      [instructor, "PUT", `${base}/${asked.id}/resolved`, {}],
    ];
    for (const [browser, method, path, body] of cases) {
      const response = await browser.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect([response.status, await response.json()], `${path} ${JSON.stringify(body)}`).toEqual([
        400,
        { error: "invalid_request" },
      ]);
    }
    expect((await a.browser.fetch(base, ok)).status).toBe(200);
  });
});
