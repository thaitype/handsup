/**
 * One room's data in the browser: the socket (spec 8.2 and 8.3) and, when the socket cannot
 * be used, HTTP polling (spec 8.6). Framework-free; the room page renders what it reports.
 */
import {
  CLOSE_FORBIDDEN,
  type QuestionView,
  type RemoveResult,
  type RoomInfo,
  type ServerMessage,
  type SnapshotMessage,
  type UpsertResult,
} from "../../shared/protocol.ts";

/** No snapshot over the socket this long after opening or dropping: use polling. */
const FIRST_SNAPSHOT_MS = 3_000;
const PING_MS = 30_000;
const PONG_MS = 10_000;
/** "About 30 seconds", spread so a classroom does not ask all at once. */
const POLL_MS = 30_000;
const POLL_JITTER_MS = 5_000;
/** A snapshot request that never answers must not stop the next one. */
const POLL_TIMEOUT_MS = 15_000;
const RECONNECT_FIRST_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type Status = "connecting" | "live" | "fallback" | "offline";
export type RoomEnd = "signed-out" | "forbidden";

export type RoomState = {
  room: RoomInfo | null;
  /** Oldest first. */
  questions: QuestionView[];
  status: Status;
  /** When a whole snapshot was last applied. */
  updatedAt: number | null;
  ended: RoomEnd | null;
};

export const initialRoomState: RoomState = {
  room: null,
  questions: [],
  status: "connecting",
  updatedAt: null,
  ended: null,
};

export class RoomConnection {
  #stopped = false;
  #room: RoomInfo | null = null;
  readonly #questions = new Map<string, QuestionView>();
  /** Removed since the last snapshot, so a late write response cannot bring one back. */
  readonly #removed = new Set<string>();
  #status: Status = "connecting";
  #updatedAt: number | null = null;
  #ended: RoomEnd | null = null;

  #socket: WebSocket | null = null;
  #attempt = 0;
  #reconnect: number | undefined;
  #deadline: number | undefined;
  #ping: number | undefined;
  #pong: number | undefined;

  #fallback = false;
  #poll: number | undefined;
  /** The snapshot request in flight, if any. There is never more than one. */
  #request: AbortController | null = null;
  /** Successful writes from this tab. A snapshot requested before the latest one is dropped. */
  #writes = 0;

  constructor(
    private readonly roomId: string,
    private readonly onChange: (state: RoomState) => void,
  ) {}

  start(): void {
    document.addEventListener("visibilitychange", this.#onVisibility);
    window.addEventListener("online", this.#onOnline);
    this.#awaitSnapshot();
    this.#open();
  }

  stop(): void {
    this.#stopped = true;
    document.removeEventListener("visibilitychange", this.#onVisibility);
    window.removeEventListener("online", this.#onOnline);
    window.clearTimeout(this.#reconnect);
    window.clearTimeout(this.#deadline);
    this.#stopPolling();
    this.#dropSocket();
  }

  /** Shows the caller's own write at once (spec 8.3 and 8.6). */
  applyWrite(result: UpsertResult | RemoveResult): void {
    if (this.#stopped) return;
    this.#writes += 1;
    if ("questionId" in result) {
      this.#remove(result.questionId);
    } else {
      const { question } = result;
      if (this.#removed.has(question.id)) return;
      // While the socket is live it delivers every change in order, and what it already
      // delivered may be newer than this response.
      if (this.#status === "live" && this.#questions.has(question.id)) return;
      this.#questions.set(question.id, question);
    }
    this.#report();
  }

  #report(): void {
    this.onChange({
      room: this.#room,
      questions: [...this.#questions.values()].sort((a, b) => a.createdAt - b.createdAt),
      status: this.#status,
      updatedAt: this.#updatedAt,
      ended: this.#ended,
    });
  }

  #replace(snapshot: SnapshotMessage): void {
    this.#room = snapshot.room;
    this.#questions.clear();
    this.#removed.clear();
    for (const question of snapshot.questions) this.#questions.set(question.id, question);
    this.#updatedAt = Date.now();
  }

  #remove(questionId: string): void {
    this.#removed.add(questionId);
    this.#questions.delete(questionId);
  }

  /** No access any more: stop both channels and forget the room (spec 8.6). */
  #end(reason: RoomEnd): void {
    this.stop();
    this.#room = null;
    this.#questions.clear();
    this.#ended = reason;
    this.#report();
  }

  // The socket.

  #open(): void {
    if (this.#stopped || this.#socket) return;
    window.clearTimeout(this.#reconnect);
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${scheme}://${window.location.host}/api/rooms/${encodeURIComponent(this.roomId)}/ws`,
    );
    this.#socket = socket;
    let hasSnapshot = false;

    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.#socket !== socket) return;
      if (event.data === "pong") {
        window.clearTimeout(this.#pong);
        return;
      }
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "snapshot") {
        hasSnapshot = true;
        this.#attempt = 0;
        window.clearTimeout(this.#deadline);
        this.#stopPolling();
        this.#replace(message);
        this.#status = "live";
        this.#keepAlive(socket);
      } else if (message.type === "question.upsert") {
        this.#questions.set(message.question.id, message.question);
      } else if (message.type === "question.remove") {
        this.#remove(message.questionId);
      }
      this.#report();
    };

    socket.onerror = () => {
      if (this.#socket === socket && !hasSnapshot) this.#startPolling();
    };

    socket.onclose = (event) => {
      if (this.#socket !== socket) return;
      this.#dropSocket();
      if (event.code === CLOSE_FORBIDDEN) return this.#end("forbidden");
      // Closed before its first snapshot, whatever the code: the socket is not usable now.
      if (!hasSnapshot) this.#startPolling();
      else this.#lostLiveSocket();
      this.#scheduleReconnect();
    };
  }

  #dropSocket(): void {
    window.clearInterval(this.#ping);
    window.clearTimeout(this.#pong);
    const socket = this.#socket;
    this.#socket = null;
    socket?.close(1000);
  }

  /** A working socket went away. A quick reconnect keeps the page out of fallback. */
  #lostLiveSocket(): void {
    this.#status = "connecting";
    this.#awaitSnapshot();
    this.#report();
  }

  #awaitSnapshot(): void {
    window.clearTimeout(this.#deadline);
    this.#deadline = window.setTimeout(() => this.#startPolling(), FIRST_SNAPSHOT_MS);
  }

  #scheduleReconnect(): void {
    if (this.#stopped) return;
    const longest = Math.min(RECONNECT_MAX_MS, RECONNECT_FIRST_MS * 2 ** this.#attempt);
    this.#attempt += 1;
    window.clearTimeout(this.#reconnect);
    // Jitter downwards only, so the stated maximum holds.
    this.#reconnect = window.setTimeout(() => this.#open(), longest * (0.5 + Math.random() / 2));
  }

  #keepAlive(socket: WebSocket): void {
    window.clearInterval(this.#ping);
    this.#ping = window.setInterval(() => {
      socket.send("ping");
      window.clearTimeout(this.#pong);
      this.#pong = window.setTimeout(() => {
        // No answer: the connection is dead even though nothing closed it.
        this.#dropSocket();
        this.#startPolling();
        this.#scheduleReconnect();
      }, PONG_MS);
    }, PING_MS);
  }

  // Polling (spec 8.6).

  #startPolling(): void {
    if (this.#stopped || this.#fallback) return;
    this.#fallback = true;
    window.clearTimeout(this.#deadline);
    this.#status = "fallback";
    this.#report();
    void this.#fetchSnapshot();
  }

  #stopPolling(): void {
    this.#fallback = false;
    window.clearTimeout(this.#poll);
    this.#request?.abort();
    this.#request = null;
  }

  async #fetchSnapshot(): Promise<void> {
    if (!this.#fallback || this.#request || document.visibilityState === "hidden") return;
    window.clearTimeout(this.#poll);
    const request = new AbortController();
    this.#request = request;
    const writesBefore = this.#writes;
    const timeout = window.setTimeout(() => request.abort(), POLL_TIMEOUT_MS);
    let wait = POLL_MS + Math.random() * POLL_JITTER_MS;
    let response: Response | null = null;
    let snapshot: SnapshotMessage | null = null;
    try {
      response = await fetch(`/api/rooms/${encodeURIComponent(this.roomId)}/snapshot`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: request.signal,
      });
      if (response.ok) snapshot = (await response.json()) as SnapshotMessage;
    } catch {
      response = null;
    } finally {
      window.clearTimeout(timeout);
    }
    // Polling stopped while this was in flight: the answer no longer counts.
    if (this.#request !== request) return;
    this.#request = null;

    if (response?.status === 401) return this.#end("signed-out");
    if (response?.status === 404) return this.#end("forbidden");
    if (snapshot) {
      if (this.#writes === writesBefore) this.#replace(snapshot);
      this.#status = "fallback";
    } else {
      if (response?.status === 429) {
        wait = Math.max(wait, Number(response.headers.get("retry-after") ?? 0) * 1000);
      }
      // What is on screen stays; the page says it could not refresh.
      this.#status = "offline";
    }
    this.#report();
    this.#poll = window.setTimeout(() => void this.#fetchSnapshot(), wait);
  }

  readonly #onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      window.clearTimeout(this.#poll);
      return;
    }
    void this.#fetchSnapshot();
    this.#onOnline();
  };

  /** Back online or back in view: try the socket now instead of waiting out the backoff. */
  readonly #onOnline = (): void => {
    if (!this.#socket) this.#open();
  };
}
