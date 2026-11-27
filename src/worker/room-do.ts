import { DurableObject } from "cloudflare:workers";
import {
  PROTOCOL_VERSION,
  ROOM_MAX_QUESTIONS,
  type QuestionView,
  type RoomInfo,
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

type SocketAttachment = { validUntil: number };

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
    return this.#view(viewer, row);
  }

  answer(identity: Identity, questionId: string, input: { body: string; clientRequestId: string }): UpsertOutcome {
    const viewer = this.#viewer(identity);
    if (viewer.role !== "instructor") return failed("forbidden");
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
    if (!earlier) {
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
    }
    return this.#view(viewer, question);
  }

  setResolved(identity: Identity, questionId: string, resolved: boolean): UpsertOutcome {
    const viewer = this.#viewer(identity);
    if (viewer.role !== "instructor") return failed("forbidden");
    const question = this.#question(questionId);
    if (!question || !canSee(viewer, question)) return failed("not_found");
    // Resolving again keeps the first time.
    const resolvedAt = resolved ? (question.resolved_at ?? Date.now()) : null;
    this.ctx.storage.sql.exec("update question set resolved_at = ? where id = ?", resolvedAt, question.id);
    return this.#view(viewer, { ...question, resolved_at: resolvedAt });
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
    return { ok: true, questionId: question.id };
  }

  deleteAnswer(identity: Identity, questionId: string, answerId: string): UpsertOutcome {
    const viewer = this.#viewer(identity);
    if (viewer.role !== "instructor") return failed("forbidden");
    const question = this.#question(questionId);
    if (!question || !canSee(viewer, question)) return failed("not_found");
    const { rowsWritten } = this.ctx.storage.sql.exec(
      "delete from answer where id = ? and question_id = ?",
      answerId,
      question.id,
    );
    if (rowsWritten === 0) return failed("not_found");
    return this.#view(viewer, question);
  }

  #viewer(identity: Identity): Viewer {
    return { id: identity.id, role: roleOf(this.env, identity.email) };
  }

  #question(id: string): QuestionRow | undefined {
    return this.ctx.storage.sql.exec<QuestionRow>("select * from question where id = ?", id).toArray()[0];
  }

  #view(viewer: Viewer, question: QuestionRow): UpsertOutcome {
    const answers = this.ctx.storage.sql
      .exec<AnswerRow>("select * from answer where question_id = ? order by created_at, rowid", question.id)
      .toArray();
    return { ok: true, question: project(viewer, question, answers) };
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

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      validUntil: Date.now() + socketMaxLifetimeSeconds(this.env) * 1000,
    } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Returns how many sockets received the message. Expired sockets are closed instead. */
  broadcast(message: string): number {
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      const { validUntil } = socket.deserializeAttachment() as SocketAttachment;
      if (validUntil <= Date.now()) {
        socket.close(4001, "expired");
        continue;
      }
      socket.send(message);
      delivered += 1;
    }
    return delivered;
  }
}
