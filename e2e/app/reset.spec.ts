/** AC15 in the browser (admin page and reset page) and AC19: text stays text. */
import { expect, test } from "@playwright/test";
import { BASE, classroom, PASSWORD, question, unique } from "../room-support.ts";

test("AC15: the instructor makes a link and the learner sets a new password with it", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Forgetful");
  await a.page.goto(room.path);
  await expect(a.page.getByTestId("room-name")).toHaveText(room.room.name);

  const teacher = room.instructor.page;
  await teacher.goto("/");
  await teacher.getByRole("link", { name: "Reset passwords" }).click();
  await teacher.getByLabel("Name or email").fill(a.email);
  await teacher.getByRole("button", { name: "Search" }).click();
  const found = teacher.getByTestId("admin-user");
  await expect(found).toHaveCount(1);
  await found.getByRole("button", { name: "Create reset link" }).click();
  const link = (await found.getByTestId("reset-link").textContent()) ?? "";
  expect(link).toMatch(new RegExp(`^${BASE}/reset#token=.+`));
  // The instructor's own account is listed without a way to reset it.
  await teacher.getByLabel("Name or email").fill(room.instructor.email);
  await teacher.getByRole("button", { name: "Search" }).click();
  await expect(found).toContainText("Instructor account: no reset link.");
  await expect(found.getByRole("button", { name: "Create reset link" })).toHaveCount(0);

  const fresh = await browser.newContext({ baseURL: BASE });
  const page = await fresh.newPage();
  const sent: { url: string; referrer: string | undefined }[] = [];
  page.on("request", (request) => sent.push({ url: request.url(), referrer: request.headers().referer }));
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset$/);
  // The dev server does not apply public/_headers; the page's own tag sets the same policy.
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await page.getByLabel("New password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByTestId("reset-done")).toBeVisible();
  // The token went nowhere but the body of the reset request.
  const token = new URL(link).hash.slice("#token=".length);
  const resets = sent.filter((r) => r.url.endsWith("/api/auth/reset-password"));
  expect(resets.map((r) => r.referrer ?? "")).toEqual([""]);
  expect(sent.filter((r) => r.url.includes(token) || r.referrer?.includes(token))).toEqual([]);

  // The old session is over, and only the new password works.
  expect((await a.request.get("/api/me")).status()).toBe(401);
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(a.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await page.getByLabel("Password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("who")).toContainText(a.name);

  // The link works once.
  await page.goto(link);
  await page.getByLabel("New password").fill("another-password-here");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("This link does not work any more.")).toBeVisible();
  await fresh.close();
  await room.close();
});

test("AC19: HTML and script in names, questions and answers show as characters", async ({ browser }) => {
  const room = await classroom(browser);
  const attack = (id: string) =>
    `<img src=x onerror="window.__pwned='${id}'"><script>window.__pwned='${id}'</script><b>${id}</b>`;
  const learnerName = `<i id="injected-name">${unique("Name")}</i>`;
  const a = await room.learner("Html");
  // Names are set at sign-up, so this person is made with an HTML name.
  const mallory = await browser.newContext({ baseURL: BASE });
  const post = (path: string, data: unknown) =>
    mallory.request.post(path, { data, headers: { "content-type": "application/json", origin: BASE } });
  expect(
    (await post("/api/auth/sign-up/email", { name: learnerName, email: `${unique("m")}@example.test`, password: PASSWORD })).status(),
  ).toBe(200);
  expect((await post("/api/join", { code: room.room.inviteCode })).status()).toBe(200);
  const body = attack("question");
  const asked = await post(`/api/rooms/${room.room.id}/questions`, {
    body,
    visibility: "public",
    clientRequestId: crypto.randomUUID(),
  });
  expect(asked.status()).toBe(200);
  const id = ((await asked.json()) as { question: { id: string } }).question.id;
  const reply = attack("answer");
  await room.answer(id, reply);

  for (const page of [a.page, room.instructor.page]) {
    await page.goto(room.path);
    const card = question(page, "question");
    await expect(card.getByTestId("question-body")).toHaveText(body);
    await expect(card.getByTestId("answer")).toContainText(reply);
    await expect(card.getByTestId("asker")).toHaveText(learnerName);
    // Nothing became an element, and nothing ran.
    await expect(page.locator("#injected-name, main img, main script, main b")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned)).toBeUndefined();
  }
  await room.instructor.page.goto("/admin");
  await room.instructor.page.getByLabel("Name or email").fill("injected-name");
  await room.instructor.page.getByRole("button", { name: "Search" }).click();
  await expect(room.instructor.page.getByTestId("admin-user").first()).toContainText("<i id=");
  await expect(room.instructor.page.locator("#injected-name")).toHaveCount(0);
  await mallory.close();
  await room.close();
});
