import { getMigrations } from "better-auth/db/migration";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { authOptions } from "../src/worker/auth.ts";
import { roleOf } from "../src/worker/role.ts";
import { Browser, uniqueEmail } from "./support/http.ts";

describe("accounts through the real sign-up API", () => {
  it("makes a listed email an instructor, ignoring case and spaces", async () => {
    const teacher = new Browser();
    expect((await teacher.signUp("TEACHER@example.test", "Teacher")).status).toBe(200);
    expect(await teacher.me()).toMatchObject({
      status: 200,
      email: "teacher@example.test",
      role: "instructor",
    });
  });

  it("makes any other email a learner", async () => {
    const learner = new Browser();
    const email = uniqueEmail("learner");
    expect((await learner.signUp(email)).status).toBe(200);
    expect(await learner.me()).toMatchObject({ status: 200, email, role: "learner" });
  });

  it("answers 401 without a session and 200 with one", async () => {
    const browser = new Browser();
    expect((await browser.me()).status).toBe(401);
    await browser.signUp(uniqueEmail("session"));
    expect((await browser.me()).status).toBe(200);
  });

  it("signs in with the right password and refuses a wrong one", async () => {
    const email = uniqueEmail("signin");
    await new Browser().signUp(email);

    const wrong = new Browser();
    expect((await wrong.signIn(email, "not-the-password")).status).toBe(401);
    expect((await wrong.me()).status).toBe(401);

    const right = new Browser();
    expect((await right.signIn(email)).status).toBe(200);
    expect((await right.me()).status).toBe(200);
  });

  it("stores a salted scrypt hash, not the password", async () => {
    const email = uniqueEmail("hash");
    await new Browser().signUp(email);
    const row = await env.DB.prepare(
      'select a.password from account a join "user" u on u.id = a.userId where u.email = ?',
    )
      .bind(email)
      .first<{ password: string }>();
    expect(row?.password).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });
});

describe("instructor list", () => {
  const withList = (list: string | undefined) => ({ ...env, INSTRUCTOR_EMAILS: list }) as Env;

  it("treats an empty list as no instructors and a missing one as an error", () => {
    expect(roleOf(withList("teacher@example.test"), "teacher@example.test")).toBe("instructor");
    expect(roleOf(withList(""), "teacher@example.test")).toBe("learner");
    expect(() => roleOf(withList(undefined), "teacher@example.test")).toThrow("INSTRUCTOR_EMAILS");
  });
});

describe("D1 migration", () => {
  it("matches the schema the installed Better Auth expects", async () => {
    const { toBeCreated, toBeAdded } = await getMigrations(authOptions(env));
    expect({ toBeCreated: toBeCreated.map((t) => t.table), toBeAdded }).toEqual({
      toBeCreated: [],
      toBeAdded: [],
    });
  });
});
