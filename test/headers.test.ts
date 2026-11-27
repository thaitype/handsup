import { describe, expect, it } from "vitest";
import { Browser, uniqueEmail } from "./support/http.ts";
import { people } from "./support/people.ts";

/** JSON-ness is read from the body, not from the header under test. */
const isJsonBody = (body: string) => {
  try {
    JSON.parse(body);
    return body.trim() !== "";
  } catch {
    return false;
  }
};

describe("Cache-Control on /api/ responses (spec 6.2)", () => {
  it("sends no-store on every kind of /api/ response", async () => {
    const { instructor, guest, learner, createRoom } = await people();
    await createRoom("Cache");
    const student = await learner();
    const responses: [string, Response][] = [
      ["room list with invite codes", await instructor.fetch("/api/rooms")],
      ["/api/me", await instructor.fetch("/api/me")],
      ["get-session", await instructor.fetch("/api/auth/get-session")],
      ["unknown /api route (404)", await guest.fetch("/api/nothing")],
      ["refused auth route (404)", await guest.fetch("/api/auth/update-user", { name: "x" })],
      ["no session (401)", await guest.fetch("/api/rooms")],
      ["learner creating a room (403)", await student.fetch("/api/rooms", { name: "x" })],
      ["bad body (400)", await instructor.fetch("/api/rooms", { name: "" })],
      [
        "not JSON (415)",
        await instructor.request("/api/rooms", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }),
      ],
      ["OAuth callback redirect (302)", await guest.fetch("/api/auth/callback/google?code=x&state=y")],
      ["library error route (302)", await guest.fetch("/api/auth/error?error=account_not_linked")],
    ];
    const statuses = new Set<number>();
    for (const [label, response] of responses) {
      expect(response.headers.get("cache-control"), label).toBe("no-store");
      statuses.add(response.status);
    }
    // The sample really holds successes, client errors and redirects.
    expect([...statuses].sort()).toEqual([200, 302, 400, 401, 403, 404, 415]);
  });

  it("leaves responses outside /api/ alone (control)", async () => {
    const response = await new Browser().fetch("/not-api");
    expect(response.headers.get("cache-control")).toBeNull();
  });
});

describe("headers on /api/ responses (spec 7.6, R25)", () => {
  it("sends nosniff on every response and a JSON type only on JSON bodies", async () => {
    const browser = new Browser();
    const email = uniqueEmail("headers");
    const responses: [string, Response][] = [
      ["unknown /api route", await browser.fetch("/api/nothing")],
      ["refused auth route", await browser.fetch("/api/auth/update-user", { name: "x" })],
      ["/api/me without session", await browser.fetch("/api/me")],
      ["sign-up", await browser.signUp(email)],
      ["/api/me with session", await browser.fetch("/api/me")],
      ["get-session", await browser.fetch("/api/auth/get-session")],
      ["OAuth callback redirect", await browser.fetch("/api/auth/callback/google?code=x&state=y")],
      ["library error page", await browser.fetch("/api/auth/error?error=account_not_linked")],
      ["sign-out", await browser.fetch("/api/auth/sign-out", {})],
    ];

    const seen = { json: 0, notJson: 0, redirect: 0 };
    for (const [label, response] of responses) {
      const body = await response.text();
      const type = response.headers.get("content-type") ?? "";
      expect(response.headers.get("x-content-type-options"), label).toBe("nosniff");
      if (isJsonBody(body)) {
        expect(type, label).toMatch(/^application\/json/);
        seen.json++;
      } else {
        expect(type, label).not.toMatch(/json/);
        seen.notJson++;
      }
      if (response.status >= 300 && response.status < 400) seen.redirect++;
    }
    // Both kinds were in the sample, so neither branch passed by being empty.
    expect(seen.json).toBeGreaterThanOrEqual(6);
    expect(seen.notJson).toBeGreaterThanOrEqual(2);
    expect(seen.redirect).toBeGreaterThanOrEqual(1);
  });

  it("sends auth errors to the app's error page", async () => {
    const response = await new Browser().fetch("/api/auth/callback/google?code=x&state=y");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "", "http://unused.test");
    expect(location.origin + location.pathname).toBe("http://localhost:5173/auth/error");
    expect(location.searchParams.get("error")).toBeTruthy();
  });
});
