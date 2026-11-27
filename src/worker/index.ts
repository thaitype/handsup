import { Hono, type Context } from "hono";
import { createAuth } from "./auth.ts";
import { viewerOf, writeGate, type AppEnv } from "./http.ts";
import { questions } from "./questions.ts";
import { rooms } from "./rooms.ts";

export { RoomDO } from "./room-do.ts";

/**
 * Spec 7.1: the only Better Auth endpoints reachable over HTTP, matched exactly on method
 * and raw path. Everything else under /api/auth/ answers 404 without reaching the library,
 * including /update-user, /change-email, /request-password-reset and GET /reset-password/:token.
 * Server code can still call them through `auth.api`.
 */
export const AUTH_ROUTES: ReadonlySet<string> = new Set([
  "POST /api/auth/sign-up/email",
  "POST /api/auth/sign-in/email",
  "POST /api/auth/sign-in/social",
  "GET /api/auth/callback/google",
  "POST /api/auth/sign-out",
  "GET /api/auth/get-session",
  "POST /api/auth/reset-password",
  "GET /api/auth/error",
]);

const notFound = (c: Context) => c.json({ error: "not_found" }, 404);

const app = new Hono<AppEnv>();

/** Statuses that carry no JSON body. Better Auth still labels its redirects as JSON. */
const hasNoBody = (status: number) => status === 101 || status === 204 || (status >= 300 && status < 400);

// Spec 7.6 (R25) and 6.2: nosniff and no-store on every /api/ response, whoever built it,
// and a JSON content type only where there is a JSON body. JSON responses set their own type.
app.use("/api/*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  // Spec 6.2: nothing under /api/ is cached, invite codes and sessions included.
  c.res.headers.set("Cache-Control", "no-store");
  if (hasNoBody(c.res.status)) c.res.headers.delete("Content-Type");
});

app.use("/api/*", writeGate);

app.all("/api/auth/*", (c) => {
  const route = `${c.req.method} ${new URL(c.req.url).pathname}`;
  return AUTH_ROUTES.has(route) ? createAuth(c.env).handler(c.req.raw) : notFound(c);
});

app.get("/api/me", async (c) => {
  const viewer = await viewerOf(c);
  if (!viewer) return c.json({ error: "unauthenticated" }, 401);
  return c.json(viewer);
});

app.route("/", rooms);
app.route("/", questions);

app.all("/api/*", notFound);

export default app;
