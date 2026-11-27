/** A fixed-window counter per user in D1. The table name comes from this union only. */
export async function takeAttempt(
  db: D1Database,
  table: "join_attempt" | "post_attempt",
  userId: string,
  now: number,
  limit: number,
  windowMs: number,
) {
  const row = await db
    .prepare(
      `insert into ${table} (user_id, window_start, count) values (?1, ?2, 1)
       on conflict (user_id) do update set
         count = case when window_start <= ?2 - ?3 then 1 else count + 1 end,
         window_start = case when window_start <= ?2 - ?3 then ?2 else window_start end
       returning count, window_start`,
    )
    .bind(userId, now, windowMs)
    .first<{ count: number; window_start: number }>();
  if (!row) throw new Error(`${table} upsert returned no row`);
  return {
    allowed: row.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000)),
  };
}
