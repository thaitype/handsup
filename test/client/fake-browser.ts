/**
 * The few browser things the room connection touches, faked so that its rules can be checked
 * one at a time with controlled time. The browser tests run the same code for real.
 */
import { vi } from "vitest";
import type { QuestionView, ServerMessage } from "../../src/shared/protocol.ts";
import { RoomConnection, type RoomState } from "../../src/client/room/connection.ts";

export class FakeSocket {
  static all: FakeSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  readonly sent: string[] = [];
  closedByClient: number | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code: number) {
    this.closedByClient ??= code;
  }
  // What the server or the network does.
  say(message: ServerMessage | "pong") {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  drop(code: number) {
    this.onclose?.({ code });
  }
  fail() {
    this.onerror?.();
  }
}

export const question = (id: string, createdAt = 1, over: Partial<QuestionView> = {}): QuestionView => ({
  id,
  visibility: "public",
  body: id,
  authorName: "A",
  isMine: false,
  createdAt,
  resolvedAt: null,
  answers: [],
  ...over,
});

export const snapshot = (...questions: QuestionView[]) =>
  ({ v: 1, type: "snapshot", room: { id: "r", name: "Room" }, questions }) as const;

type Pending = {
  url: string;
  at: number;
  signal: AbortSignal;
  respond: (status: number, body?: unknown, headers?: Record<string, string>) => Promise<void>;
  failNetwork: () => Promise<void>;
};

export function fakeBrowser() {
  vi.useFakeTimers({ now: 0 });
  FakeSocket.all = [];
  const listeners = new Map<string, Set<() => void>>();
  const target = {
    addEventListener: (name: string, listener: () => void) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
    },
    removeEventListener: (name: string, listener: () => void) => {
      listeners.get(name)?.delete(listener);
    },
  };
  const document = { ...target, visibilityState: "visible" };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", {
    ...target,
    location: { protocol: "http:", host: "app.test" },
    setTimeout: (...a: Parameters<typeof setTimeout>) => setTimeout(...a),
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: (...a: Parameters<typeof setInterval>) => setInterval(...a),
    clearInterval: (id: number) => clearInterval(id),
  });
  vi.stubGlobal("WebSocket", FakeSocket);
  const requests: Pending[] = [];
  vi.stubGlobal("fetch", (url: string, init: { signal: AbortSignal }) => {
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      const flush = () => vi.advanceTimersByTimeAsync(0).then(() => undefined);
      requests.push({
        url,
        at: Date.now(),
        signal: init.signal,
        respond: (status, body = {}, headers = {}) => {
          resolve(new Response(JSON.stringify(body), { status, headers }));
          return flush();
        },
        failNetwork: () => {
          reject(new TypeError("network"));
          return flush();
        },
      });
    });
  });

  let state!: RoomState;
  const connection = new RoomConnection("r", (next) => {
    state = next;
  });
  return {
    connection,
    requests,
    get state() {
      return state;
    },
    get socket() {
      return FakeSocket.all.at(-1)!;
    },
    get sockets() {
      return FakeSocket.all;
    },
    ids: () => state.questions.map((q) => q.id),
    wait: (ms: number) => vi.advanceTimersByTimeAsync(ms),
    visibility: (value: "visible" | "hidden") => {
      document.visibilityState = value;
      for (const listener of listeners.get("visibilitychange") ?? []) listener();
    },
    online: () => {
      for (const listener of listeners.get("online") ?? []) listener();
    },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}
