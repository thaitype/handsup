/** AC17: every write under /api/ must come from our origin, refused by our middleware. */
import { describe, expect, it } from "vitest";
import { classroom, questionFrom, roomApi, snapshotFrom } from "./support/classroom.ts";
import { Browser, ORIGIN, PASSWORD, uniqueEmail } from "./support/http.ts";

const OTHERS = ["https://evil.example", "http://localhost:5174", "https://localhost:5173", "null", null];

describe("the Origin check on writes", () => {
  it("refuses another origin or none on app and auth writes, and takes ours", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const asked = await questionFrom(await api.ask(a.browser, "stays"));
    const email = uniqueEmail("origin");
    await new Browser().signUp(email);
    const base = `/api/rooms/${room.id}`;
    const writes: [Browser, "POST" | "PUT" | "DELETE", string, object][] = [
      [new Browser(), "POST", "/api/auth/sign-in/email", { email, password: PASSWORD }],
      [new Browser(), "POST", "/api/auth/sign-up/email", { email: uniqueEmail("new"), name: "N", password: PASSWORD }],
      [a.browser, "POST", "/api/join", { code: room.inviteCode }],
      [instructor, "POST", "/api/rooms", { name: "From elsewhere" }],
      [a.browser, "POST", `${base}/questions`, { body: "x", visibility: "public", clientRequestId: "o1" }],
      [instructor, "PUT", `${base}/questions/${asked.id}/resolved`, { resolved: true }],
      [instructor, "DELETE", `${base}/questions/${asked.id}`, {}],
      [instructor, "POST", `/api/admin/users/${crypto.randomUUID()}/reset-link`, {}],
      [a.browser, "POST", "/api/auth/sign-out", {}],
    ];
    const send = (browser: Browser, method: string, path: string, body: object, origin: string | null) =>
      browser.request(
        path,
        { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        origin,
      );
    for (const [browser, method, path, body] of writes) {
      for (const origin of OTHERS) {
        const response = await send(browser, method, path, body, origin);
        expect([response.status, await response.json()], `${method} ${path} from ${origin}`).toEqual([
          403,
          { error: "forbidden_origin" },
        ]);
      }
    }
    // Nothing happened: the question is untouched and the learner is still signed in.
    const now = await snapshotFrom(await api.snapshot(a.browser));
    expect(now.questions.map((q) => [q.id, q.resolvedAt])).toEqual([[asked.id, null]]);
    // Controls: the same requests from our origin are let through.
    for (const [browser, method, path, body] of writes) {
      const status = (await send(browser, method, path, body, ORIGIN)).status;
      expect(status, `${method} ${path}`).toBe(path.includes("reset-link") ? 404 : 200);
    }
  });
});
