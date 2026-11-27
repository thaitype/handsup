import { betterAuth, type BetterAuthOptions } from "better-auth";
import { authSecret, instructorEmails, requireVar, resetLinkTtlSeconds } from "./config.ts";
import { hashPassword, verifyPassword } from "./password.ts";

const AUTH_RATE_RULE = { window: 60, max: 60 };

/** The app's page for auth errors such as `account_not_linked` (spec 7.0, 7.2). */
export const AUTH_ERROR_PATH = "/auth/error";

/**
 * Spec 7.0. Every option whose library default depends on `NODE_ENV` is set here, because
 * on Workers that variable is whatever we make it. AC22 checks the resolved values.
 *
 * Left at the library default on purpose (spec 7.2, N1): no `trustedProviders` and no
 * `requireLocalEmailVerified`, so a password account and a Google account are never linked.
 * Not set on purpose (spec 7.4): `advanced.backgroundTasks.handler`.
 */
export function authOptions(env: Env, database: BetterAuthOptions["database"] = env.DB) {
  const baseURL = requireVar(env, "BETTER_AUTH_URL");
  // Fail on a bad list here too, so every auth request fails rather than only role checks.
  instructorEmails(env);
  return {
    database,
    baseURL,
    secret: authSecret(env),
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: resetLinkTtlSeconds(env),
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    socialProviders: {
      google: {
        clientId: requireVar(env, "GOOGLE_CLIENT_ID"),
        clientSecret: requireVar(env, "GOOGLE_CLIENT_SECRET"),
      },
    },
    session: { cookieCache: { enabled: false } },
    verification: { storeIdentifier: "plain" },
    onAPIError: { errorURL: new URL(AUTH_ERROR_PATH, baseURL).toString() },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": AUTH_RATE_RULE,
        "/sign-in/social": AUTH_RATE_RULE,
        "/sign-up/email": AUTH_RATE_RULE,
      },
    },
    advanced: {
      disableOriginCheck: false,
      useSecureCookies: new URL(baseURL).protocol === "https:",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      // Schema drift is caught by the migration test in `pnpm test` instead (spec 7.0).
      database: { validateSchema: false },
    },
  } satisfies BetterAuthOptions;
}

export const createAuth = (env: Env) => betterAuth(authOptions(env));
