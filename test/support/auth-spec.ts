/**
 * AC22: the options `createAuth(env)` resolves to match spec 7.0. Shared by the default
 * project and the production-like one, because Better Auth fixes `isProduction` at import.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { authOptions, createAuth } from "../../src/worker/auth.ts";
import { hashPassword, verifyPassword } from "../../src/worker/password.ts";
import { countingD1 } from "./d1-counter.ts";

const withVars = (vars: Record<string, string | undefined>) => ({ ...env, ...vars }) as Env;

export function describeSpecOptions() {
  describe("createAuth(env) resolves spec 7.0", () => {
    it("matches every row of the table", async () => {
      const context = await createAuth(env).$context;
      const options: BetterAuthOptions = context.options;

      // The resolved value and the option itself: the library default for some of these
      // depends on NODE_ENV, so a resolved value alone could be right by accident.
      expect(context.rateLimit.enabled).toBe(true);
      expect(options.rateLimit?.enabled).toBe(true);
      expect(context.skipOriginCheck).toBe(false);
      expect(options.advanced?.disableOriginCheck).toBe(false);
      expect(options.advanced?.useSecureCookies).toBe(false);
      expect(context.secret).toBe(env.BETTER_AUTH_SECRET);
      expect(options.onAPIError?.errorURL).toBe("http://localhost:5173/auth/error");
      expect(options.advanced?.backgroundTasks?.handler).toBeUndefined();
      expect(options.verification?.storeIdentifier).toBe("plain");
      expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
      expect(options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(86_400);
      expect(options.session?.cookieCache?.enabled).toBe(false);
      expect(context.sessionConfig.cookieRefreshCache).toBe(false);
      expect(options.advanced?.database?.validateSchema).toBe(false);
      expect(context.password.hash).toBe(hashPassword);
      expect(context.password.verify).toBe(verifyPassword);
      // Spec 7.2: linking stays at the library defaults.
      expect(options.account?.accountLinking?.trustedProviders).toBeUndefined();
      expect(options.account?.accountLinking?.requireLocalEmailVerified).toBeUndefined();
    });

    it("awaits background work, because no handler is set (spec 7.4)", async () => {
      const context = await createAuth(env).$context;
      let finished = false;
      await context.runInBackgroundOrAwait(
        scheduler.wait(20).then(() => {
          finished = true;
        }),
      );
      expect(finished).toBe(true);
    });

    it("takes secure cookies from the scheme of BETTER_AUTH_URL", async () => {
      const cookieOf = async (url: string) =>
        (await createAuth(withVars({ BETTER_AUTH_URL: url })).$context).authCookies.sessionToken;
      expect(await cookieOf("http://localhost:5173")).toMatchObject({
        name: "better-auth.session_token",
        attributes: { secure: false },
      });
      expect(await cookieOf("https://handsup.example")).toMatchObject({
        name: "__Secure-better-auth.session_token",
        attributes: { secure: true },
      });
    });

    it("refuses a missing or short secret and accepts one of 32 characters", () => {
      const build = (secret: string | undefined) => () =>
        createAuth(withVars({ BETTER_AUTH_SECRET: secret }));
      expect(build(undefined)).toThrow("BETTER_AUTH_SECRET");
      expect(build("")).toThrow("BETTER_AUTH_SECRET");
      expect(build("x".repeat(31))).toThrow("at least 32");
      expect(build("x".repeat(32))).not.toThrow();
    });

    it("refuses to start while BETTER_AUTH_SECRETS exists, as a binding or in process.env", async () => {
      const replacement = "y".repeat(40);
      // Control: without it, the secret in use is ours.
      expect((await createAuth(env).$context).secret).toBe(env.BETTER_AUTH_SECRET);
      expect(() => createAuth(withVars({ BETTER_AUTH_SECRETS: `1:${replacement}` }))).toThrow(
        "BETTER_AUTH_SECRETS",
      );
      process.env.BETTER_AUTH_SECRETS = `1:${replacement}`;
      try {
        expect(() => createAuth(env)).toThrow("BETTER_AUTH_SECRETS");
      } finally {
        delete process.env.BETTER_AUTH_SECRETS;
      }
      expect((await createAuth(env).$context).secret).toBe(env.BETTER_AUTH_SECRET);
    });

    it("uses a reset lifetime that is set", async () => {
      const context = await createAuth(withVars({ RESET_LINK_TTL_SECONDS: "120" })).$context;
      expect(context.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(120);
      expect(() => createAuth(withVars({ RESET_LINK_TTL_SECONDS: "2h" }))).toThrow(
        "RESET_LINK_TTL_SECONDS",
      );
    });

    it("refuses a missing or malformed instructor list and accepts an empty one", () => {
      const build = (list: string | undefined) => () =>
        createAuth(withVars({ INSTRUCTOR_EMAILS: list }));
      expect(build(undefined)).toThrow("INSTRUCTOR_EMAILS");
      expect(build("teacher@example.test, not-an-email")).toThrow("INSTRUCTOR_EMAILS");
      expect(build("")).not.toThrow();
      expect(build(" A@Example.test ,b@example.test")).not.toThrow();
    });

    it("skips the per-request schema check that the library runs by default", async () => {
      const queriesFor = async (variant: "ours" | "library default") => {
        const counter = countingD1(env.DB);
        const options = authOptions(env, counter.database);
        const auth =
          variant === "ours"
            ? betterAuth(options)
            : betterAuth({ ...options, advanced: { ...options.advanced, database: {} } });
        const response = await auth.handler(
          new Request("http://localhost:5173/api/auth/get-session", {
            headers: { origin: "http://localhost:5173", "cf-connecting-ip": "203.0.113.9" },
          }),
        );
        expect(response.status).toBe(200);
        return counter.queries.length;
      };
      const ours = await queriesFor("ours");
      const libraryDefault = await queriesFor("library default");
      console.log("MEASURE get-session queries", JSON.stringify({ ours, libraryDefault }));
      expect(libraryDefault).toBeGreaterThan(ours);
    });
  });
}
