/** Spec 8.5 and 8.6: questions, answers and the HTTP snapshot. The room object holds them. */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { BODY_MAX_CHARS } from "../shared/protocol.ts";
import { errorResponse, readBody, viewerOf, type AppEnv, type Viewer } from "./http.ts";
import { takePostAttempt } from "./post-limit.ts";
import { roomFor } from "./room-access.ts";
import type { RemoveOutcome, UpsertOutcome, WriteError } from "./room-do.ts";

const STATUS = { not_found: 404, forbidden: 403, room_full: 409 } as const satisfies Record<WriteError, number>;

/** Trimmed, 1 to 4,000 characters, counted as code points. */
const text = z
  .string()
  .trim()
  .refine((value) => value.length > 0 && [...value].length <= BODY_MAX_CHARS);
const clientRequestId = z.string().min(1).max(64);
const askBody = z.strictObject({ body: text, visibility: z.enum(["public", "private"]), clientRequestId });
const answerBody = z.strictObject({ body: text, clientRequestId });
const resolvedBody = z.strictObject({ resolved: z.boolean() });

/**
 * The checks every room route shares, in the order spec 6.2 gives: signed in (401), then the
 * role when the action belongs to one role (403, before any lookup), then the room (404).
 */
async function enter(c: Context<AppEnv>, only?: Viewer["role"]) {
  const viewer = await viewerOf(c);
  if (!viewer) return { refused: errorResponse(c, 401, "unauthenticated") };
  if (only && viewer.role !== only) return { refused: errorResponse(c, 403, "forbidden") };
  const room = await roomFor(c.env.DB, viewer, c.req.param("id") ?? "");
  if (!room) return { refused: errorResponse(c, 404, "not_found") };
  // The room object is only ever named after a room that D1 says exists (spec 4 principle 3).
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(room.id));
  const identity = { id: viewer.id, name: viewer.name, email: viewer.email };
  return { viewer, identity, room, stub };
}

/** Counts a post against the user's limit, or answers 429. */
async function limited(c: Context<AppEnv>, userId: string) {
  const attempt = await takePostAttempt(c.env.DB, userId, Date.now());
  if (attempt.allowed) return null;
  c.header("Retry-After", String(attempt.retryAfterSeconds));
  return errorResponse(c, 429, "rate_limited");
}

const respond = (c: Context<AppEnv>, outcome: UpsertOutcome | RemoveOutcome) => {
  if (!outcome.ok) return errorResponse(c, STATUS[outcome.error], outcome.error);
  const { ok: _, ...result } = outcome;
  return c.json(result);
};

export const questions = new Hono<AppEnv>();

questions.get("/api/rooms/:id/snapshot", async (c) => {
  const entry = await enter(c);
  if (entry.refused) return entry.refused;
  return c.json(await entry.stub.snapshot(entry.identity, entry.room));
});

questions.post("/api/rooms/:id/questions", async (c) => {
  const entry = await enter(c, "learner");
  if (entry.refused) return entry.refused;
  const body = await readBody(c, askBody);
  if (!body) return errorResponse(c, 400, "invalid_request");
  const refused = await limited(c, entry.viewer.id);
  if (refused) return refused;
  return respond(c, await entry.stub.ask(entry.identity, body));
});

questions.post("/api/rooms/:id/questions/:qid/answers", async (c) => {
  const entry = await enter(c, "instructor");
  if (entry.refused) return entry.refused;
  const body = await readBody(c, answerBody);
  if (!body) return errorResponse(c, 400, "invalid_request");
  const refused = await limited(c, entry.viewer.id);
  if (refused) return refused;
  return respond(c, await entry.stub.answer(entry.identity, c.req.param("qid"), body));
});

questions.put("/api/rooms/:id/questions/:qid/resolved", async (c) => {
  const entry = await enter(c, "instructor");
  if (entry.refused) return entry.refused;
  const body = await readBody(c, resolvedBody);
  if (!body) return errorResponse(c, 400, "invalid_request");
  return respond(c, await entry.stub.setResolved(entry.identity, c.req.param("qid"), body.resolved));
});

questions.delete("/api/rooms/:id/questions/:qid", async (c) => {
  const entry = await enter(c);
  if (entry.refused) return entry.refused;
  return respond(c, await entry.stub.deleteQuestion(entry.identity, c.req.param("qid")));
});

questions.delete("/api/rooms/:id/questions/:qid/answers/:aid", async (c) => {
  const entry = await enter(c, "instructor");
  if (entry.refused) return entry.refused;
  return respond(c, await entry.stub.deleteAnswer(entry.identity, c.req.param("qid"), c.req.param("aid")));
});
