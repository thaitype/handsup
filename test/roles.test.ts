/**
 * AC1 to AC4: the role comes from INSTRUCTOR_EMAILS on every request and nothing else.
 * Requests go through the real Worker app; only the env it is given changes.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker/index.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";

/** A browser talking to the app with the given instructor list. */
const browserWith = (list: { value: string }) =>
  new Browser(async (request) => app.fetch(request, { ...env, INSTRUCTOR_EMAILS: list.value }));

const userRow = (email: string) =>
  env.DB.prepare(
    'select u.email, u.emailVerified, group_concat(a.providerId) as providers from "user" u join account a on a.userId = u.id where u.email = ? group by u.id',
  )
    .bind(email)
    .first<{ email: string; emailVerified: number; providers: string }>();

describe("roles from INSTRUCTOR_EMAILS", () => {
  it("AC1: signs up with a password, signs in again, and is a learner", async () => {
    const list = { value: "someone.else@example.test" };
    const email = uniqueEmail("ac1");
    const first = browserWith(list);
    expect((await first.signUp(email)).status).toBe(200);
    expect((await first.fetch("/api/auth/sign-out", {})).status).toBe(200);
    expect((await first.me()).status).toBe(401);

    const again = browserWith(list);
    expect((await again.signIn(email, "not-the-password")).status).toBe(401);
    expect((await again.signIn(email, PASSWORD)).status).toBe(200);
    expect(await again.me()).toMatchObject({ status: 200, email, role: "learner" });
  });

  it("AC2: a listed email signing in with a password is an instructor, another email is a learner", async () => {
    const teacher = uniqueEmail("ac2-teacher");
    const learner = uniqueEmail("ac2-learner");
    const list = { value: teacher };
    await browserWith(list).signUp(teacher);
    await browserWith(list).signUp(learner);

    const t = browserWith(list);
    expect((await t.signIn(teacher)).status).toBe(200);
    expect(await t.me()).toMatchObject({ status: 200, email: teacher, role: "instructor" });
    const l = browserWith(list);
    expect((await l.signIn(learner)).status).toBe(200);
    expect(await l.me()).toMatchObject({ status: 200, email: learner, role: "learner" });
  });

  it("AC3: a listed email signs up in any case and is an instructor; another email is a learner", async () => {
    const teacher = uniqueEmail("ac3-teacher");
    const list = { value: ` ${teacher.toUpperCase()} , other@example.test` };
    const t = browserWith(list);
    expect((await t.signUp(teacher.replace("ac3", "AC3"))).status).toBe(200);
    expect(await t.me()).toMatchObject({ status: 200, email: teacher, role: "instructor" });

    const learner = uniqueEmail("ac3-learner");
    const l = browserWith(list);
    expect((await l.signUp(learner)).status).toBe(200);
    expect(await l.me()).toMatchObject({ status: 200, email: learner, role: "learner" });
  });

  it("AC3: a user cannot change their email", async () => {
    const email = uniqueEmail("ac3-email");
    const list = { value: "" };
    const browser = browserWith(list);
    expect((await browser.signUp(email)).status).toBe(200);
    const target = uniqueEmail("ac3-new");

    const update = await browser.fetch("/api/auth/update-user", { email: target, name: "Renamed" });
    const change = await browser.fetch("/api/auth/change-email", { newEmail: target });
    expect(update.status).toBe(404);
    expect(change.status).toBe(404);

    // Control: the same session is valid and still has the old email.
    const session = await browser.fetch("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email, name: "Test User" } });
    expect((await userRow(email))?.email).toBe(email);
    expect(await userRow(target)).toBeNull();
  });

  it("AC4: the same user's role follows the list, with no Google account and no verified email", async () => {
    const email = uniqueEmail("ac4");
    const list = { value: "someone.else@example.test" };
    const browser = browserWith(list);
    expect((await browser.signUp(email)).status).toBe(200);
    expect(await userRow(email)).toMatchObject({ emailVerified: 0, providers: "credential" });

    expect(await browser.me()).toMatchObject({ status: 200, role: "learner" });
    list.value = `someone.else@example.test,${email.toUpperCase()}`;
    expect(await browser.me()).toMatchObject({ status: 200, role: "instructor" });
    list.value = "someone.else@example.test";
    expect(await browser.me()).toMatchObject({ status: 200, role: "learner" });
  });

  it("AC4: an empty list makes nobody an instructor", async () => {
    const email = uniqueEmail("ac4-empty");
    const list = { value: email };
    const browser = browserWith(list);
    expect((await browser.signUp(email)).status).toBe(200);
    // Control: listed, the same session is an instructor.
    expect(await browser.me()).toMatchObject({ status: 200, role: "instructor" });
    list.value = "";
    expect(await browser.me()).toMatchObject({ status: 200, role: "learner" });
  });

  it("refuses every auth and role request while the list is malformed", async () => {
    const email = uniqueEmail("bad-list");
    const list = { value: email };
    const browser = browserWith(list);
    expect((await browser.signUp(email)).status).toBe(200);
    expect((await browser.me()).status).toBe(200);
    list.value = `${email},`;
    expect((await browser.fetch("/api/me")).status).toBe(500);
    expect((await browserWith(list).signIn(email)).status).toBe(500);
  });
});
