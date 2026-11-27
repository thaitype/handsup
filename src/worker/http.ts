/** Shared request handling for the app's own /api/ routes. */
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { createAuth } from "./auth.ts";
import { requireVar } from "./config.ts";
import { roleOf, type Role } from "./role.ts";

export type AppEnv = { Bindings: Env };
export type Viewer = { id: string; name: string; email: string; role: Role };

export const errorResponse = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 415 | 429, error: string) =>
  c.json({ error }, status);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Spec 7.6: the request names our own origin. Browsers send it on every write and upgrade. */
export const fromOurOrigin = (c: Context<AppEnv>) =>
  c.req.header("origin") === new URL(requireVar(c.env, "BETTER_AUTH_URL")).origin;

/**
 * The one gate every write under /api/ passes, the app's routes and Better Auth's alike.
 * A write must come from our origin (spec 7.6, AC17) and say it is JSON, which a cross-site
 * form cannot do without a CORS preflight.
 */
export const writeGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (!fromOurOrigin(c)) return errorResponse(c, 403, "forbidden_origin");
  const type = c.req.header("content-type") ?? "";
  if (!/^application\/json(;|$)/i.test(type)) {
    return errorResponse(c, 415, "unsupported_media_type");
  }
  return next();
};

/** The signed-in user with their role from INSTRUCTOR_EMAILS, and their session, or null. */
export async function sessionOf(c: Context<AppEnv>) {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const { id, name, email } = session.user;
  const viewer: Viewer = { id, name, email, role: roleOf(c.env, email) };
  return { viewer, sessionId: session.session.id, expiresAt: session.session.expiresAt.getTime() };
}

export async function viewerOf(c: Context<AppEnv>): Promise<Viewer | null> {
  return (await sessionOf(c))?.viewer ?? null;
}

/** Reads a JSON body against a strict schema. Anything else, unknown fields included, is null. */
export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | null> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return null;
  }
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}
