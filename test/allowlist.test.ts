import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/worker/auth.ts";
import { AUTH_ROUTES } from "../src/worker/index.ts";
import { ORIGIN } from "./support/http.ts";

const OUR_404 = JSON.stringify({ error: "not_found" });
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type Endpoint = { path?: string; options?: { method?: string | string[] } };

/** Every HTTP route Better Auth declares, read from `auth.api` rather than written by hand. */
function declaredEndpoints() {
  const api = createAuth(env).api as unknown as Record<string, Endpoint>;
  return Object.entries(api).flatMap(([name, { path, options }]) => {
    if (!path) return []; // server-only, no HTTP route
    const methods = [options?.method ?? []].flat();
    // `:id` of the callback is the provider: try the one we use and one we do not.
    const concrete =
      path === "/callback/:id"
        ? ["/callback/google", "/callback/github"]
        : [path.replace(/:[a-zA-Z]+/g, "some-token")];
    return concrete.map((p) => ({ name, path: p, methods }));
  });
}

let nextAddress = 0;
const request = (method: string, path: string) =>
  new Request(new URL(`/api/auth${path}`, ORIGIN), {
    method,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      // A fresh address each time, so no request meets the rate limit.
      "cf-connecting-ip": `192.0.2.${(nextAddress++ % 250) + 1}`,
    },
    body: method === "GET" ? null : "{}",
    redirect: "manual",
  });

describe("auth path allowlist (spec 7.1)", () => {
  it("answers 404 for every declared endpoint outside the list, and serves the list", async () => {
    const endpoints = declaredEndpoints();
    const names = new Set(endpoints.map((e) => e.name));
    for (const name of ["updateUser", "changeEmail", "requestPasswordReset", "requestPasswordResetCallback", "linkSocialAccount"]) {
      expect(names, name).toContain(name);
    }

    const auth = createAuth(env);
    const served: string[] = [];
    const refused: string[] = [];
    const liveInLibrary: string[] = [];
    for (const { path, methods } of endpoints) {
      for (const method of METHODS) {
        const route = `${method} /api/auth${path}`;
        const response = await exports.default.fetch(request(method, path));
        const body = await response.text();
        if (AUTH_ROUTES.has(route)) {
          // Allowed: the library answered, not our router.
          expect([response.status, body], route).not.toEqual([404, OUR_404]);
          served.push(route);
          continue;
        }
        expect([response.status, body], route).toEqual([404, OUR_404]);
        refused.push(route);
        if (methods.includes(method)) {
          // Control: the library itself would serve this route, so the 404 is ours.
          const direct = await auth.handler(request(method, path));
          expect(direct.status, `library ${route}`).not.toBe(404);
          liveInLibrary.push(route);
        }
      }
    }

    console.log(
      "COUNT allowlist",
      JSON.stringify({ endpoints: names.size, served: served.length, refused: refused.length, liveInLibrary: liveInLibrary.length }),
    );
    // Every listed route is a route the library declares, and each one was tried.
    expect(served.sort()).toEqual([...AUTH_ROUTES].sort());
    expect(liveInLibrary).toEqual(
      expect.arrayContaining([
        "POST /api/auth/update-user",
        "POST /api/auth/change-email",
        "POST /api/auth/request-password-reset",
        "GET /api/auth/reset-password/some-token",
        "POST /api/auth/link-social",
        "GET /api/auth/callback/github",
        "POST /api/auth/callback/google",
        "POST /api/auth/get-session",
      ]),
    );
  });

  it.each([
    ["a trailing slash", "POST", "/api/auth/sign-in/email/"],
    ["different case", "POST", "/api/auth/Sign-In/Email"],
    ["a doubled slash", "POST", "/api/auth//sign-in/email"],
    ["an encoded character", "POST", "/api/auth/sign-in%2Femail"],
  ])("refuses a near miss: %s", async (_, method, path) => {
    const send = (m: string, p: string) =>
      exports.default.fetch(
        new Request(new URL(p, ORIGIN), {
          method: m,
          headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "192.0.2.251" },
          body: "{}",
        }),
      );
    // Control: the exact listed route is served.
    expect((await send("POST", "/api/auth/sign-in/email")).status).not.toBe(404);
    const nearMiss = await send(method, path);
    expect(nearMiss.status).toBe(404);
    // Refused by our router, not by the library happening to miss the route too.
    expect(await nearMiss.text()).toBe(OUR_404);
  });
});
