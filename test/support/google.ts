/**
 * A stand-in for Google's token endpoint. The Worker runs in the test isolate, so only
 * its outbound fetch is replaced. Production code has no test switch.
 * Spec 10.3 and AC5.
 */
import { vi } from "vitest";
import type { Browser } from "./http.ts";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type Identity = { sub: string; email: string; name: string };

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

export function mockGoogle() {
  const identities = new Map<string, Identity>();
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== TOKEN_ENDPOINT) return realFetch(request);
    const code = new URLSearchParams(await request.text()).get("code") ?? "";
    const identity = identities.get(code);
    if (!identity) return Response.json({ error: "invalid_grant" }, { status: 400 });
    // The library decodes this token without checking the signature in the code flow,
    // because it came straight from the token endpoint over TLS.
    const claims = {
      ...identity,
      email_verified: true,
      iss: "https://accounts.google.com",
      aud: "test-google-client-id",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    return Response.json({
      access_token: "mock-access-token",
      token_type: "Bearer",
      expires_in: 300,
      id_token: `${base64url({ alg: "RS256", kid: "mock" })}.${base64url(claims)}.mock`,
    });
  });

  return {
    restore: () => spy.mockRestore(),
    /** Runs the whole redirect flow and returns where the callback sent the browser. */
    async signIn(browser: Browser, email: string, name = "Google User"): Promise<URL> {
      const start = await browser.fetch("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/signed-in",
      });
      const { url } = (await start.json()) as { url: string };
      const state = new URL(url).searchParams.get("state");
      if (!state) throw new Error(`no state in ${url}`);
      const code = crypto.randomUUID();
      identities.set(code, { sub: `google-${email}`, email, name });
      const callback = await browser.fetch(
        `/api/auth/callback/google?code=${code}&state=${encodeURIComponent(state)}`,
      );
      const location = callback.headers.get("location");
      if (!location) throw new Error(`callback answered ${callback.status} without a redirect`);
      return new URL(location, "http://localhost:5173");
    },
  };
}
