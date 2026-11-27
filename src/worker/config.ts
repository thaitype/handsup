/** Reads configuration from the Worker env. A bad value throws; nothing falls back silently. */
import { z } from "zod";

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

const MIN_SECRET_LENGTH = 32;

/** Spec 7.0: the library only rejects its default secret in production, so we check ourselves. */
export function authSecret(env: Env): string {
  const secret = requireVar(env, "BETTER_AUTH_SECRET");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return secret;
}

// The same email rule Better Auth applies to sign-up (spec 7.3).
const email = z.email();

/**
 * Spec 7.3. Defined-but-empty is valid (nobody is an instructor); a missing binding is not.
 * One malformed entry, including an empty one from a stray comma, rejects the whole list.
 */
export function instructorEmails(env: Env): ReadonlySet<string> {
  const raw: string | undefined = env.INSTRUCTOR_EMAILS;
  if (raw === undefined) throw new Error("Missing required variable INSTRUCTOR_EMAILS");
  if (raw === "") return new Set();
  const entries = raw.split(",").map((entry) => entry.trim().toLowerCase());
  const bad = entries.filter((entry) => !email.safeParse(entry).success).length;
  if (bad > 0) {
    // The values are not echoed: the list is configuration, not something to put in logs.
    throw new Error(`INSTRUCTOR_EMAILS has ${bad} invalid entr${bad === 1 ? "y" : "ies"}`);
  }
  return new Set(entries);
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
