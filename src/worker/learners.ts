/** Spec 7.7: the learners an instructor can look through, all of them or one room's. */
import { LEARNERS_PAGE_SIZE, type LearnersPage } from "../shared/learners.ts";
import { instructorEmails } from "./config.ts";
import { containsPattern } from "./search.ts";

type Row = { id: string; name: string; email: string; createdAt: string; rooms: string };

/**
 * A learner is any account whose email is not in INSTRUCTOR_EMAILS, the rule of `roleOf`. It is
 * applied inside the query, so that pages and the total count learners only. The list is bound
 * as one JSON value, whatever its length.
 */
const MATCHING = `from "user" u
  where lower(trim(u.email)) not in (select value from json_each(?1))
    and (lower(u.email) like ?2 escape '\\' or lower(u.name) like ?2 escape '\\')
    and (?3 is null or exists (select 1 from room_member m where m.user_id = u.id and m.room_id = ?3))`;

/** Null when `roomId` names no room. Three statements in one batch, however many rows. */
export async function listLearners(
  env: Env,
  { search, roomId, page }: { search: string; roomId: string | undefined; page: number },
): Promise<LearnersPage | null> {
  const filter = [JSON.stringify([...instructorEmails(env)]), containsPattern(search), roomId ?? null] as const;
  const [room, count, rows] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare("select ?1 is null or exists (select 1 from room where id = ?1) as found").bind(filter[2]),
    env.DB.prepare(`select count(*) as total ${MATCHING}`).bind(...filter),
    env.DB.prepare(
      `select u.id, u.name, u.email, u."createdAt",
         (select json_group_array(json_object('id', r.id, 'name', r.name))
            from room_member m join room r on r.id = m.room_id where m.user_id = u.id) as rooms
       ${MATCHING}
       order by lower(u.name), u.email limit ${LEARNERS_PAGE_SIZE} offset ?4`,
    ).bind(...filter, (page - 1) * LEARNERS_PAGE_SIZE),
  ]);
  if (!room!.results[0]!.found) return null;
  return {
    learners: (rows!.results as Row[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: new Date(row.createdAt).getTime(),
      rooms: (JSON.parse(row.rooms) as { id: string; name: string }[]).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      ),
    })),
    page,
    pageSize: LEARNERS_PAGE_SIZE,
    total: count!.results[0]!.total as number,
  };
}
