/**
 * One room's data in the browser, kept up to date over the socket (spec 8.2 and 8.3).
 * Framework-free; the room page renders what it reports.
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

const PING_MS = 30_000;
const PONG_MS = 10_000;
const RECONNECT_FIRST_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type Status = "connecting" | "live";
export type RoomEnd = "forbidden";

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
  #ping: number | undefined;
  #pong: number | undefined;

  constructor(
    private readonly roomId: string,
    private readonly onChange: (state: RoomState) => void,
  ) {}

  start(): void {
    document.addEventListener("visibilitychange", this.#onVisibility);
    window.addEventListener("online", this.#onOnline);
    this.#open();
  }

  stop(): void {
    this.#stopped = true;
    document.removeEventListener("visibilitychange", this.#onVisibility);
    window.removeEventListener("online", this.#onOnline);
    window.clearTimeout(this.#reconnect);
    this.#dropSocket();
  }

  /** Shows the caller's own write at once (spec 8.3). */
  applyWrite(result: UpsertResult | RemoveResult): void {
    if (this.#stopped) return;
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

    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.#socket !== socket) return;
      if (event.data === "pong") {
        window.clearTimeout(this.#pong);
        return;
      }
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "snapshot") {
        this.#attempt = 0;
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

    socket.onclose = (event) => {
      if (this.#socket !== socket) return;
      this.#dropSocket();
      if (event.code === CLOSE_FORBIDDEN) return this.#end("forbidden");
      this.#status = "connecting";
      this.#report();
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
        this.#status = "connecting";
        this.#report();
        this.#scheduleReconnect();
      }, PONG_MS);
    }, PING_MS);
  }

  readonly #onVisibility = (): void => {
    if (document.visibilityState === "visible") this.#onOnline();
  };

  /** Back online or back in view: try the socket now instead of waiting out the backoff. */
  readonly #onOnline = (): void => {
    if (!this.#socket) this.#open();
  };
}
