/** AC15 and spec 7.4: reset links made by an instructor. */
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { classroom, instructorBrowser, roomApi } from "./support/classroom.ts";
import { mockGoogle } from "./support/google.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";
import { createLink, redeem, tokenFrom, userId } from "./support/reset.ts";
import { upgrade } from "./support/socket.ts";

const NEW_PASSWORD = "a-brand-new-password";
const tokensFor = async (id: string) =>
  (
    await env.DB.prepare("select count(*) as n from verification where identifier like 'reset-password:%' and value = ?")
      .bind(id)
      .first<{ n: number }>()
  )!.n;
const auditFor = async (id: string) =>
  (
    await env.DB.prepare(
      "select actor_user_id, target_user_id, created_at from reset_audit where target_user_id = ? order by created_at",
    )
      .bind(id)
      .all()
  ).results;

describe("a reset link from the admin API", () => {
  it("sets a new password, once", async () => {
    const instructor = await instructorBrowser();
    const email = uniqueEmail("reset");
    await new Browser().signUp(email);
    const id = await userId(email);
    const token = await tokenFrom(await createLink(instructor, id));

    expect((await redeem(token, NEW_PASSWORD)).status).toBe(200);
    expect((await new Browser().signIn(email, NEW_PASSWORD)).status).toBe(200);
    expect((await new Browser().signIn(email, PASSWORD)).status).toBe(401);

    const again = await redeem(token, "yet-another-password");
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await new Browser().signIn(email, "yet-another-password")).status).toBe(401);
    expect((await new Browser().signIn(email, NEW_PASSWORD)).status).toBe(200);
  });

  it("stops working when a newer one is made", async () => {
    const instructor = await instructorBrowser();
    const email = uniqueEmail("older");
    await new Browser().signUp(email);
    const id = await userId(email);
    const older = await tokenFrom(await createLink(instructor, id));
    const newer = await tokenFrom(await createLink(instructor, id));
    expect(older).not.toBe(newer);
    expect(await tokensFor(id)).toBe(1);
    expect((await redeem(older, NEW_PASSWORD)).status).toBe(400);
    expect((await redeem(newer, NEW_PASSWORD)).status).toBe(200);
  });

  it("ends every session of that account, and no one else's", async () => {
    const { room, instructor, member } = await classroom();
    const api = roomApi(room.id);
    const target = await member("Target");
    const bystander = await member("Bystander");
    const second = new Browser();
    expect((await second.signIn(target.email)).status).toBe(200);
    // Controls: all of these work before the reset.
    for (const browser of [target.browser, second, bystander.browser]) {
      expect((await browser.me()).status).toBe(200);
      expect((await api.snapshot(browser)).status).toBe(200);
    }
    const token = await tokenFrom(await createLink(instructor, await userId(target.email)));
    // Making the link ends nothing.
    expect((await target.browser.me()).status).toBe(200);

    expect((await redeem(token, NEW_PASSWORD)).status).toBe(200);

    for (const browser of [target.browser, second]) {
      expect((await browser.me()).status).toBe(401);
      expect((await api.snapshot(browser)).status).toBe(401);
      expect((await upgrade(browser, room.id)).status).toBe(401);
      expect((await api.ask(browser, "after reset")).status).toBe(401);
    }
    expect((await api.snapshot(bystander.browser)).status).toBe(200);
    expect((await instructor.me()).status).toBe(200);
  });

  it("writes who reset whom, without the token", async () => {
    const instructor = await instructorBrowser();
    const email = uniqueEmail("audit");
    await new Browser().signUp(email);
    const id = await userId(email);
    expect(await auditFor(id)).toEqual([]);
    const before = Date.now();
    const token = await tokenFrom(await createLink(instructor, id));
    expect(await auditFor(id)).toEqual([
      {
        actor_user_id: await userId("teacher@example.test"),
        target_user_id: id,
        created_at: expect.any(Number),
      },
    ]);
    expect(((await auditFor(id))[0] as { created_at: number }).created_at).toBeGreaterThanOrEqual(before);
    const everything = JSON.stringify((await env.DB.prepare("select * from reset_audit").all()).results);
    expect(everything).not.toContain(token);
  });

  it("keeps the library's own reset routes closed", async () => {
    const guest = new Browser();
    const email = uniqueEmail("public");
    await guest.signUp(email);
    const asked = await new Browser().fetch("/api/auth/request-password-reset", { email });
    expect(asked.status).toBe(404);
    expect((await new Browser().fetch("/api/auth/reset-password/some-token?callbackURL=/")).status).toBe(404);
    expect(await tokensFor(await userId(email))).toBe(0);
  });
});

describe("who may get a link, and who may make one", () => {
  let google: ReturnType<typeof mockGoogle> | undefined;
  afterEach(() => google?.restore());

  it("refuses instructor accounts and Google-only accounts, and makes nothing for them", async () => {
    const instructor = await instructorBrowser();
    const other = new Browser();
    await other.signUp("second.teacher@example.test");
    google = mockGoogle();
    const googleEmail = uniqueEmail("googleonly");
    expect((await google.signIn(new Browser(), googleEmail)).pathname).toBe("/signed-in");

    for (const [email, reason] of [
      ["second.teacher@example.test", "instructor_account"],
      ["teacher@example.test", "instructor_account"],
      [googleEmail, "google_account"],
    ] as const) {
      const id = await userId(email);
      const response = await createLink(instructor, id);
      expect([response.status, await response.json()], email).toEqual([409, { error: reason }]);
      expect(await tokensFor(id), email).toBe(0);
      expect(await auditFor(id), email).toEqual([]);
    }
    // Controls: a password learner gets one, and so does an account left with no sign-in method.
    const learner = uniqueEmail("plain");
    await new Browser().signUp(learner);
    expect((await createLink(instructor, await userId(learner))).status).toBe(200);
    const orphan = uniqueEmail("orphan");
    await new Browser().signUp(orphan);
    const orphanId = await userId(orphan);
    await env.DB.prepare('delete from account where "userId" = ?').bind(orphanId).run();
    const token = await tokenFrom(await createLink(instructor, orphanId));
    expect((await redeem(token, NEW_PASSWORD)).status).toBe(200);
    expect((await new Browser().signIn(orphan, NEW_PASSWORD)).status).toBe(200);
  });

  it("is for instructors only, decided before any lookup", async () => {
    const { instructor, member, guest } = await classroom();
    const learner = await member("Nosy");
    const target = await userId(learner.email);
    const missing = crypto.randomUUID();
    for (const id of [target, missing]) {
      expect((await createLink(guest, id)).status).toBe(401);
      expect((await createLink(learner.browser, id)).status).toBe(403);
    }
    expect((await createLink(instructor, missing)).status).toBe(404);
    expect((await createLink(instructor, target)).status).toBe(200);
    expect((await guest.fetch("/api/admin/users?q=a")).status).toBe(401);
    expect((await learner.browser.fetch("/api/admin/users?q=a")).status).toBe(403);
    expect((await instructor.fetch("/api/admin/users?q=a")).status).toBe(200);
    expect((await instructor.fetch(`/api/admin/users/${target}/reset-link`, { extra: 1 })).status).toBe(400);
  });

  it("finds users by name or email as written, and shows nothing about their questions", async () => {
    const instructor = await instructorBrowser();
    const tag = crypto.randomUUID().slice(0, 8);
    await new Browser().signUp(`find-${tag}@example.test`, `Findable_${tag} 100%`);
    await new Browser().signUp(uniqueEmail("unrelated"), "Unrelated Person");
    const search = async (q: string) => {
      const response = await instructor.fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      expect(response.status).toBe(200);
      return ((await response.json()) as { users: Record<string, unknown>[] }).users;
    };
    for (const q of [`FINDABLE_${tag}`, `find-${tag}@`, "100%"]) {
      expect((await search(q)).map((u) => u.email), q).toEqual([`find-${tag}@example.test`]);
    }
    // Wildcard characters are ordinary text.
    expect(await search("Unrel%Person")).toEqual([]);
    expect(await search("Unrel_ted")).toEqual([]);
    expect(Object.keys((await search(tag))[0]!).sort()).toEqual(["email", "id", "name", "resetRefusal"]);
    expect((await instructor.fetch("/api/admin/users?q=")).status).toBe(400);
  });
});
