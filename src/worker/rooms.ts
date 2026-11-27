/** Spec 7.5 and 8.5: rooms, invite codes and joining. Rooms live in D1 (spec 5). */
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, readBody, viewerOf, type AppEnv } from "./http.ts";
import { takeAttempt } from "./attempts.ts";
import { generateInviteCode, normalizeInviteCode } from "./invite-code.ts";

export const JOIN_LIMIT = 10;
export const JOIN_WINDOW_MS = 60_000;

const createRoomBody = z.strictObject({ name: z.string().trim().min(1).max(100) });
const rotateBody = z.strictObject({});
const joinBody = z.strictObject({ code: z.string().max(64) });

type RoomRow = { id: string; name: string; invite_code: string; created_at: number };

/** Counts one join attempt for the user. False once they are over the limit in this window. */
export const takeJoinAttempt = (db: D1Database, userId: string, now: number) =>
  takeAttempt(db, "join_attempt", userId, now, JOIN_LIMIT, JOIN_WINDOW_MS);

/** Inserts with a fresh code, trying again on the (unlikely) clash with an existing one. */
async function withFreshCode<T>(attempt: (code: string) => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt(generateInviteCode());
    } catch (error) {
      if (tries >= 3 || !String(error).includes("UNIQUE constraint failed: room.invite_code")) throw error;
    }
  }
}

export const rooms = new Hono<AppEnv>();

rooms.get("/api/rooms", async (c) => {
  const viewer = await viewerOf(c);
  if (!viewer) return errorResponse(c, 401, "unauthenticated");
  if (viewer.role === "instructor") {
    const { results } = await c.env.DB.prepare(
      "select id, name, invite_code, created_at from room order by created_at desc, id",
    ).all<RoomRow>();
    return c.json({
      rooms: results.map((r) => ({ id: r.id, name: r.name, inviteCode: r.invite_code, createdAt: r.created_at })),
    });
  }
  const { results } = await c.env.DB.prepare(
    `select r.id, r.name, r.created_at from room r
     join room_member m on m.room_id = r.id
     where m.user_id = ? order by r.created_at desc, r.id`,
  )
    .bind(viewer.id)
    .all<Omit<RoomRow, "invite_code">>();
  return c.json({ rooms: results.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })) });
});

rooms.post("/api/rooms", async (c) => {
  const viewer = await viewerOf(c);
  if (!viewer) return errorResponse(c, 401, "unauthenticated");
  if (viewer.role !== "instructor") return errorResponse(c, 403, "forbidden");
  const body = await readBody(c, createRoomBody);
  if (!body) return errorResponse(c, 400, "invalid_request");
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const inviteCode = await withFreshCode(async (code) => {
    await c.env.DB.prepare(
      "insert into room (id, name, invite_code, created_by, created_at) values (?, ?, ?, ?, ?)",
    )
      .bind(id, body.name, code, viewer.id, createdAt)
      .run();
    return code;
  });
  return c.json({ id, name: body.name, inviteCode, createdAt });
});

rooms.post("/api/rooms/:id/invite-code/rotate", async (c) => {
  const viewer = await viewerOf(c);
  if (!viewer) return errorResponse(c, 401, "unauthenticated");
  // Spec 6.2: an instructor-only action answers 403 from the role, before any lookup.
  if (viewer.role !== "instructor") return errorResponse(c, 403, "forbidden");
  if (!(await readBody(c, rotateBody))) return errorResponse(c, 400, "invalid_request");
  const id = c.req.param("id");
  const changed = await withFreshCode(async (code) => {
    const result = await c.env.DB.prepare("update room set invite_code = ? where id = ?")
      .bind(code, id)
      .run();
    return result.meta.changes === 1 ? code : null;
  });
  if (!changed) return errorResponse(c, 404, "not_found");
  return c.json({ id, inviteCode: changed });
});

rooms.post("/api/join", async (c) => {
  const viewer = await viewerOf(c);
  if (!viewer) return errorResponse(c, 401, "unauthenticated");
  const body = await readBody(c, joinBody);
  if (!body) return errorResponse(c, 400, "invalid_request");

  const attempt = await takeJoinAttempt(c.env.DB, viewer.id, Date.now());
  if (!attempt.allowed) {
    c.header("Retry-After", String(attempt.retryAfterSeconds));
    return errorResponse(c, 429, "rate_limited");
  }

  // Spec 7.5: every wrong code, malformed or unknown, gets the same answer.
  const code = normalizeInviteCode(body.code);
  const room = code
    ? await c.env.DB.prepare("select id, name from room where invite_code = ?")
        .bind(code)
        .first<{ id: string; name: string }>()
    : null;
  if (!room) return errorResponse(c, 400, "invalid_code");

  // Instructors see every room already (spec 6.1), so they get no membership row.
  if (viewer.role === "learner") {
    await c.env.DB.prepare(
      "insert into room_member (room_id, user_id, joined_at) values (?, ?, ?) on conflict do nothing",
    )
      .bind(room.id, viewer.id, Date.now())
      .run();
  }
  return c.json({ room: { id: room.id, name: room.name } });
});
