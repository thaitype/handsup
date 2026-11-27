/** The socket half of the room connection: spec 8.2, 8.3 and the write rules. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser, question, snapshot } from "./fake-browser.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const live = (...questions: ReturnType<typeof question>[]) => {
  const browser = fakeBrowser();
  browser.connection.start();
  browser.socket.say(snapshot(...questions));
  return browser;
};

describe("state from the socket", () => {
  it("replaces on a snapshot and merges events by id", () => {
    const b = live(question("one", 1));
    expect(b.socket.url).toBe("ws://app.test/api/rooms/r/ws");
    expect(b.state.status).toBe("live");
    b.socket.say({ v: 1, type: "question.upsert", question: question("two", 2) });
    b.socket.say({ v: 1, type: "question.upsert", question: question("one", 1, { body: "changed" }) });
    expect(b.ids()).toEqual(["one", "two"]);
    expect(b.state.questions[0]!.body).toBe("changed");
    b.socket.say({ v: 1, type: "question.remove", questionId: "one" });
    expect(b.ids()).toEqual(["two"]);
    b.socket.say(snapshot(question("three", 3)));
    expect(b.ids()).toEqual(["three"]);
  });

  it("shows a new write at once, never lets it replace a newer event, and never revives a removal", () => {
    const b = live(question("one"));
    b.connection.applyWrite({ question: question("mine", 2) });
    expect(b.ids()).toEqual(["one", "mine"]);
    b.socket.say({ v: 1, type: "question.upsert", question: question("one", 1, { body: "newer" }) });
    b.connection.applyWrite({ question: question("one", 1, { body: "older response" }) });
    expect(b.state.questions[0]!.body).toBe("newer");
    b.socket.say({ v: 1, type: "question.remove", questionId: "mine" });
    b.connection.applyWrite({ question: question("mine", 2) });
    expect(b.ids()).toEqual(["one"]);
    b.connection.applyWrite({ questionId: "one" });
    expect(b.ids()).toEqual([]);
  });
});

describe("reconnecting", () => {
  /** Drops sockets before their snapshot and records how long each next try took. */
  const delays = async (random: number, tries: number) => {
    vi.spyOn(Math, "random").mockReturnValue(random);
    const b = fakeBrowser();
    b.connection.start();
    const seen: number[] = [];
    for (let i = 0; i < tries; i++) {
      const count = b.sockets.length;
      b.socket.drop(1006);
      let waited = 0;
      while (b.sockets.length === count && waited < 120_000) {
        await b.wait(250);
        waited += 250;
      }
      seen.push(waited);
    }
    b.connection.stop();
    return seen;
  };

  it("backs off from 1 second to at most 30", async () => {
    expect(await delays(0.999999, 8)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it("spreads each wait down to half", async () => {
    expect(await delays(0, 7)).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000]);
  });

  it("starts the backoff again after a snapshot", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const b = fakeBrowser();
    b.connection.start();
    for (const wait of [1000, 2000, 4000]) {
      b.socket.drop(1006);
      await b.wait(wait);
    }
    expect(b.sockets).toHaveLength(4);
    b.socket.say(snapshot());
    b.socket.drop(4001);
    await b.wait(1000);
    expect(b.sockets).toHaveLength(5);
  });

  it("tries at once when the browser is back online or the page is seen again", async () => {
    const b = live();
    b.socket.drop(1006);
    b.online();
    expect(b.sockets).toHaveLength(2);
    b.online();
    expect(b.sockets).toHaveLength(2);
    b.socket.drop(1006);
    b.visibility("visible");
    expect(b.sockets).toHaveLength(3);
  });

  it("stops everything on 4003 and forgets the room", async () => {
    const b = live(question("one"));
    b.socket.drop(4003);
    expect(b.state).toMatchObject({ ended: "forbidden", room: null, questions: [] });
    await b.wait(120_000);
    b.online();
    expect(b.sockets).toHaveLength(1);
  });

  it("closes the socket and goes quiet when the page leaves the room", async () => {
    const b = live();
    const socket = b.socket;
    b.connection.stop();
    expect(socket.closedByClient).toBe(1000);
    await b.wait(120_000);
    expect(socket.sent).toEqual([]);
    expect(b.sockets).toHaveLength(1);
    expect(b.listenerCount()).toBe(0);
  });

  it("pings every 30 seconds and stays while it is answered", async () => {
    const b = live();
    for (let i = 0; i < 3; i++) {
      await b.wait(30_000);
      b.socket.say("pong");
    }
    await b.wait(9_000);
    expect(b.socket.sent).toEqual(["ping", "ping", "ping"]);
    expect(b.sockets).toHaveLength(1);
    expect(b.socket.closedByClient).toBeNull();
  });
});
