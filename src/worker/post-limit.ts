import { POST_LIMIT, POST_WINDOW_MS } from "../shared/protocol.ts";
import { takeAttempt } from "./attempts.ts";

/** Spec N5: ten posts per minute per user, questions and answers together, across rooms. */
export const takePostAttempt = (db: D1Database, userId: string, now: number) =>
  takeAttempt(db, "post_attempt", userId, now, POST_LIMIT, POST_WINDOW_MS);
