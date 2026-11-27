/** The WebSocket channel: spec 8.1 to 8.4, AC7, AC10, AC13, AC14, AC16 and AC17. */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { QuestionView, ServerMessage, SnapshotMessage } from "../src/shared/protocol.ts";
import { classroom, everything, questionFrom, roomApi, snapshotFrom } from "./support/classroom.ts";
import { Browser, ORIGIN, PASSWORD } from "./support/http.ts";
import { connect, upgrade } from "./support/socket.ts";

const snapshotOf = (messages: ServerMessage[]) => {
  const first = messages[0];
  if (first?.type !== "snapshot") throw new Error(`first message was ${first?.type}`);
  return first;
};

/** What a client holds after applying messages in order (spec 8.2 and 8.3). */
const held = (messages: ServerMessage[]) => {
  const state = new Map<string, QuestionView>();
  for (const message of messages) {
    if (message.type === "snapshot") {
      state.clear();
      for (const q of message.questions) state.set(q.id, q);
    } else if (message.type === "question.upsert") state.set(message.question.id, message.question);
    else state.delete(message.questionId);
  }
  return [...state.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
};

describe("AC7: who may open the socket", () => {
  it("opens for members and instructors, and answers everyone else", async () => {
    const { room, guest, instructor, member, outsider } = await classroom("Sockets");
    const inside = await member("In");
    const outside = await outsider("Out");
    expect((await upgrade(guest, room.id)).status).toBe(401);
    const refused = await everything(await upgrade(outside.browser, room.id));
    expect(refused.status).toBe(404);
    expect(refused.all).toBe((await everything(await upgrade(outside.browser, crypto.randomUUID()))).all);
    for (const browser of [inside.browser, instructor]) {
      const client = await connect(browser, room.id);
      expect(snapshotOf(client.messages())).toMatchObject({ v: 1, room: { id: room.id, name: "Sockets" }, questions: [] });
      client.socket.close(1000);
    }
    // Once joined, the same person gets in.
    expect((await outside.browser.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);
    (await connect(outside.browser, room.id)).socket.close(1000);
  });

  it("answers a request that is not an upgrade without opening anything", async () => {
    const { room, member } = await classroom();
    const a = await member("A");
    const plain = await a.browser.fetch(`/api/rooms/${room.id}/ws`);
    expect(plain.status).toBe(426);
  });

  it("forwards nothing the client sent: a forged identity header changes nothing", async () => {
    const { room, member, stub } = await classroom();
    const a = await member("A");
    const b = await member("B");
    await questionFrom(await roomApi(room.id).ask(a.browser, "hidden-from-b", "private"));
    const forged = encodeURIComponent(
      JSON.stringify({
        identity: { id: "x", name: "x", email: "teacher@example.test" },
        room: { id: room.id, name: "x" },
        sessionId: "x",
        sessionExpiresAt: Date.now() + 60_000,
        member: true,
      }),
    );
    const response = await b.browser.request(`/api/rooms/${room.id}/ws`, {
      method: "GET",
      headers: { Upgrade: "websocket", "x-handsup-connection": forged },
    });
    const socket = response.webSocket!;
    const frames: string[] = [];
    socket.addEventListener("message", (e) => {
      frames.push(String(e.data));
    });
    socket.accept();
    await vi.waitFor(() => expect(frames).toHaveLength(1));
    expect(frames[0]).not.toContain("hidden-from-b");
    // The tags and attachment name B's own session.
    const attached = await runInDurableObject(stub, (_o, state) =>
      state.getWebSockets().map((s) => ({ tags: state.getTags(s), ...(s.deserializeAttachment() as object) })),
    );
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({ email: b.email, member: true });
    expect(Object.keys(attached[0]!).sort()).toEqual(["email", "member", "sessionId", "tags", "userId", "validUntil"]);
    expect((attached[0] as { tags: string[] }).tags).toEqual([
      expect.stringMatching(/^user:.+/),
      expect.stringMatching(/^session:.+/),
    ]);
    socket.close(1000);
  });
});

describe("events (spec 8.2)", () => {
  it("brings every change to those who may see it, with the instructor getting the asker (AC10)", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    const forA = await connect(a.browser, room.id);
    const forB = await connect(b.browser, room.id);
    const forInstructor = await connect(instructor, room.id);

    const hidden = await questionFrom(await api.ask(a.browser, "private question", "private"));
    await questionFrom(await api.answer(instructor, hidden.id, "private answer"));
    await questionFrom(await api.resolve(instructor, hidden.id));
    const open = await questionFrom(await api.ask(a.browser, "public control"));
    await Promise.all([forA, forB, forInstructor].map((s) => s.received("public control")));

    const upserts = (messages: ServerMessage[]) =>
      messages.flatMap((m) => (m.type === "question.upsert" ? [m.question] : []));
    const instructorGot = upserts(forInstructor.messages()).filter((q) => q.id === hidden.id);
    expect(instructorGot).toHaveLength(3);
    for (const q of instructorGot) expect(q).toMatchObject({ authorName: a.name, isMine: false });
    expect(Object.keys(instructorGot[0]!)).not.toContain("authorId");
    const askerGot = upserts(forA.messages()).filter((q) => q.id === hidden.id);
    expect(askerGot).toHaveLength(3);
    for (const q of askerGot) expect(q).toMatchObject({ authorName: null, isMine: true });
    expect(askerGot.at(-1)).toMatchObject({ answers: [{ body: "private answer" }], resolvedAt: expect.any(Number) });
    // B heard only the public one.
    expect(upserts(forB.messages()).map((q) => q.id)).toEqual([open.id]);
    expect(forB.frames.join()).not.toContain(a.email);

    expect((await api.removeQuestion(instructor, hidden.id)).status).toBe(200);
    expect((await api.removeQuestion(instructor, open.id)).status).toBe(200);
    for (const s of [forA, forB, forInstructor]) await s.received(`"question.remove","questionId":"${open.id}"`);
    const removals = (s: typeof forA) => s.messages().flatMap((m) => (m.type === "question.remove" ? [m.questionId] : []));
    expect(removals(forA)).toEqual([hidden.id, open.id]);
    expect(removals(forInstructor)).toEqual([hidden.id, open.id]);
    expect(removals(forB)).toEqual([open.id]);
    for (const s of [forA, forB, forInstructor]) expect(held(s.messages())).toEqual([]);
  });

  it("loses no change made while a socket is connecting", { timeout: 30_000 }, async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const seed = await questionFrom(await api.ask(a.browser, "seed"));
    for (let round = 0; round < 15; round++) {
      const [client] = await Promise.all([
        connect(instructor, room.id),
        api.resolve(instructor, seed.id, round % 2 === 0),
        api.resolve(instructor, seed.id, round % 2 !== 0),
        api.resolve(instructor, seed.id, round % 2 === 0),
      ]);
      expect(client.messages()[0]?.type).toBe("snapshot");
      const now = (await snapshotFrom(await api.snapshot(instructor))).questions;
      await vi.waitFor(() => expect(held(client.messages())).toEqual(now), { timeout: 2_000 });
      client.socket.close(1000);
    }
  });

  it("closes with 4400 when the client sends anything but ping", async () => {
    const { room, member } = await classroom();
    const a = await member("A");
    const client = await connect(a.browser, room.id);
    client.socket.send("ping");
    await client.received("pong");
    expect(client.closes).toEqual([]);
    client.socket.send(JSON.stringify({ type: "question.remove" }));
    await vi.waitFor(() => expect(client.closes).toEqual([4400]));
  });
});

describe("AC13 over the socket: reconnect", () => {
  it("replaces state with what the room holds now, deletions included", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const kept = await questionFrom(await api.ask(a.browser, "kept"));
    const gone = await questionFrom(await api.ask(a.browser, "gone"));
    const before = await connect(a.browser, room.id);
    expect(held(before.messages()).map((q) => q.id)).toEqual([kept.id, gone.id]);
    before.socket.close(1000);
    await api.removeQuestion(instructor, gone.id);
    const added = await questionFrom(await api.ask(a.browser, "added"));
    const after = await connect(a.browser, room.id);
    const snapshot = snapshotOf(after.messages()) as SnapshotMessage;
    expect(snapshot.questions.map((q) => q.id)).toEqual([kept.id, added.id]);
    expect(snapshot).toEqual(await snapshotFrom(await api.snapshot(a.browser)));
    after.socket.close(1000);
  });
});

describe("AC14: eviction", () => {
  it("keeps the same sockets working, with the same rules, after the object is evicted", async () => {
    const { room, instructor, member, stub } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    const forB = await connect(b.browser, room.id);
    const forInstructor = await connect(instructor, room.id);
    const marker = () => runInDurableObject(stub, (o) => (o as unknown as { marker?: string }).marker);
    await runInDurableObject(stub, (o) => {
      (o as unknown as { marker?: string }).marker = "before eviction";
    });
    expect(await marker()).toBe("before eviction");

    await evictDurableObject(stub);

    expect(await marker()).toBeUndefined();
    await questionFrom(await api.ask(a.browser, "private after eviction", "private"));
    await questionFrom(await api.ask(a.browser, "public after eviction"));
    await forB.received("public after eviction");
    await forInstructor.received("private after eviction");
    expect(forB.frames.join()).not.toContain("private after eviction");
    expect([...forB.closes, ...forInstructor.closes]).toEqual([]);
    forB.socket.close(1000);
    forInstructor.socket.close(1000);
  });
});

describe("the role at the time of sending (spec 8.1 and 8.4)", () => {
  /** Stands for an email taken off the instructor list after the socket was opened. */
  const rewrite = (stub: DurableObjectStub, from: string, email: string) =>
    runInDurableObject(stub as never, (_o: unknown, state: DurableObjectState) => {
      for (const socket of state.getWebSockets()) {
        const attached = socket.deserializeAttachment() as { email: string };
        if (attached.email === from) socket.serializeAttachment({ ...attached, email });
      }
    });

  it("closes with 4003 a socket that was only an instructor's and no longer is", async () => {
    const { room, instructor, member, stub } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const demoted = await connect(instructor, room.id);
    const control = await connect(a.browser, room.id);
    await rewrite(stub, "teacher@example.test", "former@example.test");
    await questionFrom(await api.ask(a.browser, "public after demotion"));
    await control.received("public after demotion");
    await vi.waitFor(() => expect(demoted.closes).toEqual([4003]));
    expect(demoted.frames.join()).not.toContain("public after demotion");
    control.socket.close(1000);
  });
});

describe("AC16: revocation and expiry", () => {
  it("lets a revoked session neither reconnect nor read, and leaves another session working", async () => {
    const { room, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const second = new Browser();
    expect((await second.signIn(a.email)).status).toBe(200);
    const b = await member("B");

    // Controls: before the revocation both work for this session.
    const open = await connect(a.browser, room.id);
    expect((await api.snapshot(a.browser)).status).toBe(200);
    await questionFrom(await api.ask(b.browser, "before revoke"));
    await open.received("before revoke");
    const other = await connect(second, room.id);

    expect((await a.browser.fetch("/api/auth/sign-out", {})).status).toBe(200);
    expect((await upgrade(a.browser, room.id)).status).toBe(401);
    expect((await api.snapshot(a.browser)).status).toBe(401);

    expect((await api.snapshot(second)).status).toBe(200);
    await questionFrom(await api.ask(b.browser, "after revoke"));
    await other.received("after revoke");
    (await connect(second, room.id)).socket.close(1000);
    open.socket.close(1000);
    other.socket.close(1000);
  });

  it("refuses the very cookie that was signed out", async () => {
    const { room, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const copy = a.browser.clone();
    expect((await api.snapshot(copy)).status).toBe(200);
    (await connect(copy, room.id)).socket.close(1000);
    expect((await a.browser.fetch("/api/auth/sign-out", {})).status).toBe(200);
    expect((await api.snapshot(copy)).status).toBe(401);
    expect((await upgrade(copy, room.id)).status).toBe(401);
  });

  it("ends a socket's validity with its session when that is sooner", { timeout: 15_000 }, async () => {
    const { room, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    // Without "remember me" the library never extends a session. Otherwise a session this close
    // to its end would be renewed by the very request that opens the socket.
    const shortLived = new Browser();
    expect(
      (await shortLived.fetch("/api/auth/sign-in/email", { email: a.email, password: PASSWORD, rememberMe: false }))
        .status,
    ).toBe(200);
    await env.DB.prepare('update session set "expiresAt" = ? where "userId" = (select id from "user" where email = ?)')
      .bind(new Date(Date.now() + 2_000).toISOString(), a.email)
      .run();
    const expiring = await connect(shortLived, room.id);
    const lasting = await connect(b.browser, room.id);
    await questionFrom(await api.ask(b.browser, "in time"));
    await expiring.received("in time");
    await scheduler.wait(2_500);
    await questionFrom(await api.ask(b.browser, "too late"));
    await lasting.received("too late");
    await vi.waitFor(() => expect(expiring.closes).toEqual([4001]));
    expect(expiring.frames.join()).not.toContain("too late");
    lasting.socket.close(1000);
  });
});

describe("AC17 for the socket and the snapshot", () => {
  it("refuses an upgrade from another origin or none, and accepts ours", async () => {
    const { room, member } = await classroom();
    const a = await member("A");
    for (const origin of ["https://evil.example", "http://localhost:5174", "null", null]) {
      expect((await upgrade(a.browser, room.id, origin)).status, String(origin)).toBe(403);
    }
    const ours = await upgrade(a.browser, room.id, ORIGIN);
    expect(ours.status).toBe(101);
    expect(ours.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ours.headers.get("content-type")).toBeNull();
    ours.webSocket!.accept();
    ours.webSocket!.close(1000);
  });

  it("gives the snapshot no CORS headers, and needs no Origin on it", async () => {
    const { room, member } = await classroom();
    const a = await member("A");
    const path = `/api/rooms/${room.id}/snapshot`;
    for (const origin of ["https://evil.example", null]) {
      const response = await a.browser.request(path, { method: "GET" }, origin);
      expect(response.status, String(origin)).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-type")).toMatch(/^application\/json/);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
