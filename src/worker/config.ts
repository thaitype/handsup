/** Reads configuration from the Worker env. A bad value throws; nothing falls back silently. */

type RequiredVar =
  | "BETTER_AUTH_SECRET"
  | "BETTER_AUTH_URL"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET";

export function requireVar(env: Env, name: RequiredVar): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required variable ${name}`);
  return value;
}

/** Defined-but-empty is valid (nobody is an instructor). A missing binding is not. */
export function instructorEmails(env: Env): ReadonlySet<string> {
  const raw: string | undefined = env.INSTRUCTOR_EMAILS;
  if (raw === undefined) throw new Error("Missing required variable INSTRUCTOR_EMAILS");
  // M1 adds per-entry email validation that rejects the whole list (spec 7.3).
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function seconds(name: string, raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^[0-9]+$/.test(raw) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

export const resetLinkTtlSeconds = (env: Env): number =>
  seconds("RESET_LINK_TTL_SECONDS", env.RESET_LINK_TTL_SECONDS, 86_400, Number.MAX_SAFE_INTEGER);

export const socketMaxLifetimeSeconds = (env: Env): number =>
  seconds("SOCKET_MAX_LIFETIME_SECONDS", env.SOCKET_MAX_LIFETIME_SECONDS, 900, 900);
