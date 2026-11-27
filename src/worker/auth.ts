import { betterAuth, type BetterAuthOptions } from "better-auth";
import { requireVar, resetLinkTtlSeconds } from "./config.ts";

const AUTH_RATE_RULE = { window: 60, max: 60 };

/**
 * M0 subset of spec 7.0. M1 completes the table, adds the path allowlist and
 * replaces the default password hash with the prefixed one.
 */
export function authOptions(env: Env, database: BetterAuthOptions["database"] = env.DB) {
  const baseURL = requireVar(env, "BETTER_AUTH_URL");
  return {
    database,
    baseURL,
    secret: requireVar(env, "BETTER_AUTH_SECRET"),
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: resetLinkTtlSeconds(env),
    },
    socialProviders: {
      google: {
        clientId: requireVar(env, "GOOGLE_CLIENT_ID"),
        clientSecret: requireVar(env, "GOOGLE_CLIENT_SECRET"),
      },
    },
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
      useSecureCookies: baseURL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
  } satisfies BetterAuthOptions;
}

export const createAuth = (env: Env) => betterAuth(authOptions(env));
