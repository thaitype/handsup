import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockGoogle } from "./support/google.ts";
import { Browser, uniqueEmail } from "./support/http.ts";

let google: ReturnType<typeof mockGoogle>;
beforeEach(() => {
  google = mockGoogle();
});
afterEach(() => google.restore());

const providers = async (email: string) => {
  const { results } = await env.DB.prepare(
    'select a.providerId from account a join "user" u on u.id = a.userId where u.email = ? order by 1',
  )
    .bind(email)
    .all<{ providerId: string }>();
  return results.map((row) => row.providerId);
};

describe.each([
  { who: "learner", email: () => uniqueEmail("link"), role: "learner" },
  { who: "instructor", email: () => "second.teacher@example.test", role: "instructor" },
])("password and Google accounts are never linked ($who)", ({ who, email: makeEmail, role }) => {
  it("signs a new Google user in", async () => {
    const email = uniqueEmail(`google-${who}`);
    const browser = new Browser();
    expect((await google.signIn(browser, email)).pathname).toBe("/signed-in");
    expect(await browser.me()).toMatchObject({ status: 200, email, role: "learner" });
    expect(await providers(email)).toEqual(["google"]);
  });

  it("refuses Google for an existing password account", async () => {
    const email = makeEmail();
    expect((await new Browser().signUp(email)).status).toBe(200);

    const browser = new Browser();
    const landing = await google.signIn(browser, email);

    expect(landing.searchParams.get("error")).toBe("account_not_linked");
    expect((await browser.me()).status).toBe(401);
    expect(await providers(email)).toEqual(["credential"]);
  });

  it("refuses password sign-up for an existing Google account", async () => {
    // A different instructor address, so the previous case cannot satisfy this one.
    const email = who === "instructor" ? "teacher@example.test" : uniqueEmail("google-first");
    const owner = new Browser();
    expect((await google.signIn(owner, email)).pathname).toBe("/signed-in");
    expect(await owner.me()).toMatchObject({ status: 200, role });

    const intruder = new Browser();
    const response = await intruder.signUp(email);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    });
    expect((await intruder.me()).status).toBe(401);
    expect(await providers(email)).toEqual(["google"]);
  });
});
