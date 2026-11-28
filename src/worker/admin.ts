/**
 * The instructor's admin routes: spec 7.4, finding a user and handing them a link to set a new
 * password, and spec 7.7, the list of learners.
 */
import { betterAuth } from "better-auth";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { authOptions } from "./auth.ts";
import { requireVar, resetLinkTtlSeconds } from "./config.ts";
import { errorResponse, readBody, viewerOf, type AppEnv } from "./http.ts";
import { listLearners } from "./learners.ts";
import { roleOf } from "./role.ts";
import { containsPattern } from "./search.ts";

const SEARCH_LIMIT = 20;
const searchQuery = z.string().trim().min(1).max(200);
const emptyBody = z.strictObject({});

export type ResetRefusal = "instructor_account" | "google_account";

type UserRow = { id: string; name: string; email: string; accounts: number; passwords: number };

const USER_COLUMNS = `u.id, u.name, u.email,
  (select count(*) from account a where a."userId" = u.id) as accounts,
  (select count(*) from account a where a."userId" = u.id and a."providerId" = 'credential') as passwords`;

/**
 * Spec 7.4 step 2. Not for instructors, so one cannot take over another. Not for an account
 * that only signs in with Google, since the library would give it a password. An account
 * left with no sign-in method at all may get one.
 */
function refusal(env: Env, user: UserRow): ResetRefusal | null {
  if (roleOf(env, user.email) === "instructor") return "instructor_account";
  if (user.accounts > 0 && user.passwords === 0) return "google_account";
  return null;
}

/** Spec 6.2: instructors only, decided from the role before anything is looked up. */
async function instructor(c: Context<AppEnv>) {
  const viewer = await viewerOf(c);
  if (!viewer) return { refused: errorResponse(c, 401, "unauthenticated") };
  if (viewer.role !== "instructor") return { refused: errorResponse(c, 403, "forbidden") };
  return { viewer };
}

export const admin = new Hono<AppEnv>();

admin.get("/api/admin/users", async (c) => {
  const entry = await instructor(c);
  if (entry.refused) return entry.refused;
  const query = searchQuery.safeParse(c.req.query("q"));
  if (!query.success) return errorResponse(c, 400, "invalid_request");
  const { results } = await c.env.DB.prepare(
    `select ${USER_COLUMNS} from "user" u
     where lower(u.email) like ?1 escape '\\' or lower(u.name) like ?1 escape '\\'
     order by u.email limit ${SEARCH_LIMIT}`,
  )
    .bind(containsPattern(query.data))
    .all<UserRow>();
  // Nothing about what a user has asked is shown here (spec 6.2).
  return c.json({
    users: results.map((u) => ({ id: u.id, name: u.name, email: u.email, resetRefusal: refusal(c.env, u) })),
  });
});

/** Each parameter at most once, and no others. */
const once = <T extends z.ZodType>(value: T) => z.tuple([value]).transform(([only]) => only as z.output<T>);
const learnerQuery = z.strictObject({
  q: once(z.string().trim().max(200)).optional(),
  room: once(z.string().min(1).max(64)).optional(),
  page: once(z.string().regex(/^[1-9][0-9]{0,5}$/)).optional(),
});

admin.get("/api/admin/learners", async (c) => {
  const entry = await instructor(c);
  if (entry.refused) return entry.refused;
  const query = learnerQuery.safeParse(c.req.queries());
  if (!query.success) return errorResponse(c, 400, "invalid_request");
  const { q, room, page } = query.data;
  const result = await listLearners(c.env, { search: q ?? "", roomId: room, page: Number(page ?? 1) });
  return result ? c.json(result) : errorResponse(c, 404, "not_found");
});

admin.post("/api/admin/users/:id/reset-link", async (c) => {
  const entry = await instructor(c);
  if (entry.refused) return entry.refused;
  if (!(await readBody(c, emptyBody))) return errorResponse(c, 400, "invalid_request");
  const user = await c.env.DB.prepare(`select ${USER_COLUMNS} from "user" u where u.id = ?`)
    .bind(c.req.param("id"))
    .first<UserRow>();
  if (!user) return errorResponse(c, 404, "not_found");
  const refused = refusal(c.env, user);
  if (refused) return errorResponse(c, 409, refused);

  // Step 3: earlier links stop working before the new one exists.
  await c.env.DB.prepare(
    "delete from verification where identifier like 'reset-password:%' and value = ?",
  )
    .bind(user.id)
    .run();

  // Step 4: only this instance can send a reset, and it sends nothing: it hands us the token.
  // The library awaits this callback because no background task handler is configured.
  let token: string | null = null;
  const options = authOptions(c.env);
  const auth = betterAuth({
    ...options,
    emailAndPassword: {
      ...options.emailAndPassword,
      sendResetPassword: async (data) => {
        token = data.token;
      },
    },
  });
  await auth.api.requestPasswordReset({ body: { email: user.email } });
  if (!token) throw new Error("the library issued no reset token");

  await c.env.DB.prepare(
    "insert into reset_audit (id, actor_user_id, target_user_id, created_at) values (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), entry.viewer.id, user.id, Date.now())
    .run();

  // Step 5: the token travels in the fragment, which never reaches a server log.
  const link = new URL("/reset", requireVar(c.env, "BETTER_AUTH_URL"));
  link.hash = `token=${token}`;
  return c.json({ link: link.toString(), expiresInSeconds: resetLinkTtlSeconds(c.env) });
});
