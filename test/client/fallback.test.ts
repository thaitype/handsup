/** Spec 8.6: when polling starts, how it runs and when it ends. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser, question, snapshot } from "./fake-browser.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const started = () => {
  const b = fakeBrowser();
  b.connection.start();
  return b;
};
const live = () => {
  const b = started();
  b.socket.say(snapshot(question("one")));
  return b;
};
/** In fallback with the first snapshot applied. */
const polling = async () => {
  const b = started();
  b.socket.drop(1006);
  await b.requests[0]!.respond(200, snapshot(question("one")));
  return b;
};

describe("entering fallback", () => {
  it.each([1000, 1006, 4001, 4400])("polls at once when a socket closes with %i before its snapshot", (code) => {
    const b = started();
    b.socket.drop(code);
    expect(b.requests.map((r) => r.url)).toEqual(["/api/rooms/r/snapshot"]);
    expect(b.state.status).toBe("fallback");
  });

  it("polls at once when a connecting socket errors", () => {
    const b = started();
    b.socket.fail();
    expect(b.requests).toHaveLength(1);
  });

  it("polls after 3 seconds without a snapshot, not before", async () => {
    const b = started();
    await b.wait(2_999);
    expect(b.requests).toHaveLength(0);
    await b.wait(1);
    expect(b.requests).toHaveLength(1);
  });

  it("does not poll when a closed socket is back within 3 seconds", async () => {
    const b = live();
    b.socket.drop(4001);
    await b.wait(1_000);
    expect(b.sockets).toHaveLength(2);
    b.socket.say(snapshot(question("one")));
    // Long past the 3 seconds, and short of the first ping.
    await b.wait(25_000);
    expect(b.requests).toHaveLength(0);
    expect(b.state.status).toBe("live");
  });

  it("polls when a working socket is not replaced within 3 seconds", async () => {
    const b = live();
    b.socket.drop(1006);
    await b.wait(3_000);
    expect(b.requests).toHaveLength(1);
  });

  it("polls when a ping gets no pong within 10 seconds", async () => {
    const b = live();
    const first = b.socket;
    await b.wait(30_000 + 9_999);
    expect(b.requests).toHaveLength(0);
    await b.wait(1);
    expect(first.closedByClient).toBe(1000);
    expect(b.requests).toHaveLength(1);
    await b.wait(1_000);
    expect(b.sockets).toHaveLength(2);
  });

  it("does not ask again each time another socket attempt fails", async () => {
    const b = await polling();
    for (let i = 0; i < 4; i++) {
      await b.wait(1_000 * 2 ** i);
      b.socket.drop(1006);
    }
    expect(b.sockets.length).toBeGreaterThan(3);
    expect(b.requests).toHaveLength(1);
  });
});

describe("the polling rhythm", () => {
  it.each([
    [0, 30_000],
    // Timers take whole milliseconds, so the longest wait is just under 35 seconds.
    [0.999999, 34_999],
  ])("waits 30 seconds plus jitter after the answer (random %f)", async (random, expected) => {
    vi.spyOn(Math, "random").mockReturnValue(random);
    const b = await polling();
    await b.wait(expected - 1);
    expect(b.requests).toHaveLength(1);
    await b.wait(1);
    expect(b.requests).toHaveLength(2);
  });

  it("keeps one request in flight and counts from its answer", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const b = started();
    b.socket.drop(1006);
    await b.wait(12_000);
    b.visibility("visible");
    expect(b.requests).toHaveLength(1);
    await b.requests[0]!.respond(200, snapshot());
    await b.wait(29_999);
    expect(b.requests).toHaveLength(1);
    await b.wait(1);
    expect(b.requests).toHaveLength(2);
  });

  it("moves on from a request that never answers", async () => {
    const b = started();
    b.socket.drop(1006);
    await b.wait(15_000);
    expect(b.requests[0]!.signal.aborted).toBe(true);
    expect(b.state.status).toBe("offline");
    await b.wait(36_000);
    expect(b.requests).toHaveLength(2);
  });

  it("pauses while hidden and asks at once when seen again", async () => {
    const b = await polling();
    b.visibility("hidden");
    await b.wait(120_000);
    expect(b.requests).toHaveLength(1);
    b.visibility("visible");
    expect(b.requests).toHaveLength(2);
  });

  it("schedules nothing from an answer that arrives while hidden", async () => {
    const b = await polling();
    await b.wait(35_000);
    b.visibility("hidden");
    await b.requests[1]!.respond(200, snapshot(question("two")));
    await b.wait(120_000);
    expect(b.requests).toHaveLength(2);
    expect(b.ids()).toEqual(["two"]);
  });

  it("does not ask when fallback starts on a hidden page, until it is seen", async () => {
    const b = started();
    b.visibility("hidden");
    b.socket.drop(1006);
    await b.wait(120_000);
    expect(b.requests).toHaveLength(0);
    b.visibility("visible");
    expect(b.requests).toHaveLength(1);
  });
});

describe("answers to a poll", () => {
  it("replaces the state with the snapshot and says when", async () => {
    const b = await polling();
    expect(b.ids()).toEqual(["one"]);
    await b.wait(35_000);
    await b.requests[1]!.respond(200, snapshot(question("two")));
    expect(b.ids()).toEqual(["two"]);
    expect(b.state.updatedAt).toBe(Date.now());
  });

  it.each([
    [401, "signed-out"],
    [404, "forbidden"],
  ] as const)("ends on %i: nothing more is asked or kept", async (status, ended) => {
    const b = await polling();
    await b.wait(35_000);
    await b.requests[1]!.respond(status);
    expect(b.state).toMatchObject({ ended, room: null, questions: [] });
    const sockets = b.sockets.length;
    await b.wait(120_000);
    expect(b.requests).toHaveLength(2);
    expect(b.sockets).toHaveLength(sockets);
  });

  it.each([500, 503])("keeps the data on %i, says so, and tries again next cycle", async (status) => {
    const b = await polling();
    await b.wait(35_000);
    await b.requests[1]!.respond(status);
    expect(b.state.status).toBe("offline");
    expect(b.ids()).toEqual(["one"]);
    await b.wait(35_000);
    await b.requests[2]!.respond(200, snapshot());
    expect(b.state.status).toBe("fallback");
  });

  it("treats a network failure the same way", async () => {
    const b = await polling();
    await b.wait(35_000);
    await b.requests[1]!.failNetwork();
    expect(b.state.status).toBe("offline");
    expect(b.ids()).toEqual(["one"]);
    await b.wait(35_000);
    expect(b.requests).toHaveLength(3);
  });

  it("waits at least Retry-After on 429", async () => {
    const b = await polling();
    await b.wait(35_000);
    await b.requests[1]!.respond(429, {}, { "retry-after": "90" });
    await b.wait(89_999);
    expect(b.requests).toHaveLength(2);
    await b.wait(1);
    expect(b.requests).toHaveLength(3);
  });

  it("drops a snapshot requested before this tab's latest write, and uses the next", async () => {
    const b = await polling();
    await b.wait(35_000);
    b.connection.applyWrite({ question: question("mine", 2) });
    b.connection.applyWrite({ questionId: "one" });
    expect(b.ids()).toEqual(["mine"]);
    await b.requests[1]!.respond(200, snapshot(question("one")));
    expect(b.ids()).toEqual(["mine"]);
    await b.wait(35_000);
    await b.requests[2]!.respond(200, snapshot(question("mine", 2), question("theirs", 3)));
    expect(b.ids()).toEqual(["mine", "theirs"]);
  });

  it("shows a changed question from a write at once, since no socket will bring it", async () => {
    const b = await polling();
    b.connection.applyWrite({ question: question("one", 1, { resolvedAt: 5 }) });
    expect(b.state.questions[0]!.resolvedAt).toBe(5);
  });
});

describe("going back to the socket", () => {
  it("stops polling on a socket snapshot and ignores the answer still on its way", async () => {
    const b = await polling();
    await b.wait(35_000);
    b.socket.say(snapshot(question("from-socket")));
    expect(b.state.status).toBe("live");
    expect(b.requests[1]!.signal.aborted).toBe(true);
    await b.requests[1]!.respond(200, snapshot(question("late")));
    expect(b.ids()).toEqual(["from-socket"]);
    expect(b.state.status).toBe("live");
    await b.wait(25_000);
    b.socket.say("pong");
    expect(b.requests).toHaveLength(2);
  });

  it("can fall back again later", async () => {
    const b = await polling();
    await b.wait(1_000);
    b.socket.say(snapshot());
    b.socket.drop(1006);
    await b.wait(1_000);
    b.socket.drop(1006);
    expect(b.requests).toHaveLength(2);
  });
});
