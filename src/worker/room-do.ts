import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_FORBIDDEN,
  CLOSE_PROTOCOL,
  CLOSE_RECONNECT,
  PROTOCOL_VERSION,
  ROOM_MAX_QUESTIONS,
  type QuestionView,
  type RoomInfo,
  type ServerMessage,
  type SnapshotMessage,
  type Visibility,
} from "../shared/protocol.ts";
import { socketMaxLifetimeSeconds } from "./config.ts";
import { migrate } from "./room/schema.ts";
import { canSee, project, type AnswerRow, type QuestionRow, type Viewer } from "./room/visibility.ts";
import { roleOf } from "./role.ts";

/** Who is acting, as the Worker verified it. The role is derived here, on every call. */
export type Identity = { id: string; name: string; email: string };

export type WriteError = "not_found" | "forbidden" | "room_full";
type Failed = { ok: false; error: WriteError };
export type UpsertOutcome = { ok: true; question: QuestionView } | Failed;
export type RemoveOutcome = { ok: true; questionId: string } | Failed;

/** What the Worker verified before it handed a socket upgrade to the room. */
export type Connection = {
  identity: Identity;
  room: RoomInfo;
  sessionId: string;
  sessionExpiresAt: number;
  /** False for an instructor who is not also a member of the room. */
  member: boolean;
};
export const CONNECTION_HEADER = "x-handsup-connection";

/** Spec 8.1. No role: it is derived from the instructor list at every send. */
type SocketAttachment = {
  userId: string;
  sessionId: string;
  email: string;
  member: boolean;
  validUntil: number;
};

const failed = (error: WriteError): Failed => ({ ok: false, error });

/**
 * One room (spec 5 and 8). Public methods return views only; rows never leave this object.
 * Every write is synchronous, so nothing can interleave inside one.
 */
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void ctx.blockConcurrencyWhile(async () => migrate(ctx.storage));
  }

  /** The whole room as one viewer sees it (spec 6.2). */
  snapshot(identity: Identity, room: RoomInfo): SnapshotMessage {
    return this.#snapshotFor(this.#viewer(identity), room);
  }

  ask(
    identity: Identity,
    input: { body: string; visibility: Visibility; clientRequestId: string },
  ): UpsertOutcome {
    const viewer = this.#viewer(identity);
    // Spec 6.1: asking is the learner's action.
    if (viewer.role !== "learner") return failed("forbidden");
    const sql = this.ctx.storage.sql;
    // A retry answers with what the first attempt made (spec 8.3).
    const earlier = sql
      .exec<QuestionRow>(
        "select * from question where author_id = ? and client_request_id = ?",
        viewer.id,
        input.clientRequestId,
      )
      .toArray()[0];
    if (earlier) return this.#view(viewer, earlier);
    const { total } = sql.exec<{ total: number }>("select count(*) as total from question").one();
    if (total >= ROOM_MAX_QUESTIONS) return failed("room_full");
    const row: QuestionRow = {
      id: crypto.randomUUID(),
      author_id: viewer.id,
      author_name: identity.name,
      visibility: input.visibility,
      body: input.body,
      created_at: Date.now(),
      resolved_at: null,
    };
    sql.exec(
      `insert into question (id, author_id, author_name, visibility, body, created_at, resolved_at, client_request_id)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.author_id,
      row.author_name,
      row.visibility,
      row.body,
      row.created_at,
      row.resolved_at,
      input.clientRequestId,
    );
    this.#publish(row);
    return this.#view(viewer, row);
  }

  /** Adds to the thread under a question: instructors, and the person who asked it. */
  answer(identity: Identity, questionId: string, input: { body: string; clientRequestId: string }): UpsertOutcome {
    const viewer = this.#viewer(identity);
    const sql = this.ctx.storage.sql;
    const earlier = sql
      .exec<{ question_id: string }>(
        "select question_id from answer where author_id = ? and client_request_id = ?",
        viewer.id,
        input.clientRequestId,
      )
      .toArray()[0];
    const question = this.#question(earlier?.question_id ?? questionId);
    if (!question || !canSee(viewer, question)) return failed("not_found");
    if (viewer.role !== "instructor" && question.author_id !== viewer.id) return failed("forbidden");
    // A retry changes nothing, so it cannot reopen a question resolved since the first try.
    if (earlier) return this.#view(viewer, question);
    // The asker writing again reopens a resolved question. An instructor's message does not.
    const reopens = viewer.role !== "instructor" && question.resolved_at !== null;
    const changed = reopens ? { ...question, resolved_at: null } : question;
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        `insert into answer (id, question_id, author_id, author_name, body, created_at, client_request_id)
         values (?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        question.id,
        viewer.id,
        identity.name,
        input.body,
        Date.now(),
        input.clientRequestId,
      );
      if (reopens) sql.exec("update question set resolved_at = null where id = ?", question.id);
    });
    this.#publish(changed);
    return this.#view(viewer, changed);
  }

  setResolved(identity: Identity, questionId: string, resolved: boolean): UpsertOutcome {
    const viewer = this.#viewer(identity);
    if (viewer.role !== "instructor") return failed("forbidden");
    const question = this.#question(questionId);
    if (!question || !canSee(viewer, question)) return failed("not_found");
    // Resolving again keeps the first time.
    const resolvedAt = resolved ? (question.resolved_at ?? Date.now()) : null;
    this.ctx.storage.sql.exec("update question set resolved_at = ? where id = ?", resolvedAt, question.id);
    const changed = { ...question, resolved_at: resolvedAt };
    this.#publish(changed);
    return this.#view(viewer, changed);
  }

  deleteQuestion(identity: Identity, questionId: string): RemoveOutcome {
    const viewer = this.#viewer(identity);
    const question = this.#question(questionId);
    // Spec 6.2: a question you may not see answers exactly like one that does not exist.
    if (!question || !canSee(viewer, question)) return failed("not_found");
    if (viewer.role !== "instructor" && question.author_id !== viewer.id) return failed("forbidden");
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("delete from answer where question_id = ?", question.id);
      this.ctx.storage.sql.exec("delete from question where id = ?", question.id);
    });
    // Only those who could see it hear that it is gone (spec 6.2).
    this.#emit((watcher) =>
      canSee(watcher, question)
        ? { v: PROTOCOL_VERSION, type: "question.remove", questionId: question.id }
        : null,
    );
    return { ok: true, questionId: question.id };
  }

  deleteAnswer(identity: Identity, questionId: string, answerId: string): UpsertOutcome {
    const viewer = this.#viewer(identity);
    const question = this.#question(questionId);
    if (!question || !canSee(viewer, question)) return failed("not_found");
    const sql = this.ctx.storage.sql;
    const message = sql
      .exec<{ author_id: string }>(
        "select author_id from answer where id = ? and question_id = ?",
        answerId,
        question.id,
      )
      .toArray()[0];
    if (!message) return failed("not_found");
    // Instructors delete any message, anyone else only their own.
    if (viewer.role !== "instructor" && message.author_id !== viewer.id) return failed("forbidden");
    sql.exec("delete from answer where id = ?", answerId);
    this.#publish(question);
    return this.#view(viewer, question);
  }

  #viewer(identity: Identity): Viewer {
    return { id: identity.id, role: roleOf(this.env, identity.email) };
  }

  #question(id: string): QuestionRow | undefined {
    return this.ctx.storage.sql.exec<QuestionRow>("select * from question where id = ?", id).toArray()[0];
  }

  #view(viewer: Viewer, question: QuestionRow): UpsertOutcome {
    return { ok: true, question: project(viewer, question, this.#answers(question.id)) };
  }

  #answers(questionId: string): AnswerRow[] {
    return this.ctx.storage.sql
      .exec<AnswerRow>("select * from answer where question_id = ? order by created_at, rowid", questionId)
      .toArray();
  }

  /** Sends the question, as each watcher may see it, to those who may see it. */
  #publish(question: QuestionRow): void {
    let answers: AnswerRow[] | undefined;
    this.#emit((watcher) => {
      if (!canSee(watcher, question)) return null;
      answers ??= this.#answers(question.id);
      return { v: PROTOCOL_VERSION, type: "question.upsert", question: project(watcher, question, answers) };
    });
  }

  /** Every event goes through here, to every socket of the room. */
  #emit(message: (watcher: Viewer) => ServerMessage | null): void {
    for (const socket of this.ctx.getWebSockets()) this.#send(socket, message);
  }

  /**
   * The only place that writes to a socket. A socket with nothing to hear is left untouched,
   * so that not even a close tells it that something happened. Otherwise its validity and the
   * viewer's role are checked now (spec 8.1 and 8.4).
   */
  #send(socket: WebSocket, message: (watcher: Viewer) => ServerMessage | null): void {
    if (socket.readyState !== WebSocket.READY_STATE_OPEN) return;
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    const watcher = this.#viewer({ id: attachment.userId, name: "", email: attachment.email });
    const outgoing = message(watcher);
    if (!outgoing) return;
    if (attachment.validUntil <= Date.now()) {
      socket.close(CLOSE_RECONNECT, "expired");
    } else if (watcher.role === "learner" && !attachment.member) {
      // Admitted as an instructor, and no longer one.
      socket.close(CLOSE_FORBIDDEN, "forbidden");
    } else {
      socket.send(JSON.stringify(outgoing));
    }
  }

  /** Used by the HTTP snapshot and the socket connect alike. */
  #snapshotFor(viewer: Viewer, room: RoomInfo): SnapshotMessage {
    const sql = this.ctx.storage.sql;
    const answers = new Map<string, AnswerRow[]>();
    for (const answer of sql.exec<AnswerRow>("select * from answer order by created_at, rowid")) {
      const list = answers.get(answer.question_id);
      if (list) list.push(answer);
      else answers.set(answer.question_id, [answer]);
    }
    const questions = sql
      .exec<QuestionRow>("select * from question order by created_at, rowid")
      .toArray()
      .filter((question) => canSee(viewer, question))
      .map((question) => project(viewer, question, answers.get(question.id) ?? []));
    return { v: PROTOCOL_VERSION, type: "snapshot", room: { id: room.id, name: room.name }, questions };
  }

  /** The socket upgrade. Only the Worker can reach this, after checking who is asking. */
  override async fetch(request: Request): Promise<Response> {
    const header = request.headers.get(CONNECTION_HEADER);
    if (request.headers.get("Upgrade") !== "websocket" || !header) {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const connection = JSON.parse(decodeURIComponent(header)) as Connection;
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];

    // Accept, query and send with nothing awaited in between, so every later event
    // reaches this socket after the snapshot and none is lost (spec 8.1).
    const { userId, sessionId } = { userId: connection.identity.id, sessionId: connection.sessionId };
    this.ctx.acceptWebSocket(server, [`user:${userId}`, `session:${sessionId}`]);
    server.serializeAttachment({
      userId,
      sessionId,
      email: connection.identity.email,
      member: connection.member,
      validUntil: Math.min(
        connection.sessionExpiresAt,
        Date.now() + socketMaxLifetimeSeconds(this.env) * 1000,
      ),
    } satisfies SocketAttachment);
    this.#send(server, (watcher) => this.#snapshotFor(watcher, connection.room));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The client only ever sends `ping`, which is answered without waking this object. */
  override async webSocketMessage(socket: WebSocket): Promise<void> {
    socket.close(CLOSE_PROTOCOL, "protocol");
  }
}
