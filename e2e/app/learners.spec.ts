/** AC31 in the browser: the instructor's list of learners, its room selector, search and pages. */
import { expect, test } from "@playwright/test";
import { BASE, classroom, PASSWORD, unique } from "../room-support.ts";

test("AC31: the instructor lists learners and filters them by room and by name", async ({ browser }) => {
  const first = await classroom(browser);
  const second = await classroom(browser);
  const inFirst = await first.learner("ListFirst");
  const inSecond = await second.learner("ListSecond");
  const lonely = await browser.newContext({ baseURL: BASE });
  const lonelyName = unique("ListNoRoom");
  const signedUp = await lonely.request.post("/api/auth/sign-up/email", {
    data: { name: lonelyName, email: `${lonelyName}@example.test`, password: PASSWORD },
    headers: { "content-type": "application/json", origin: BASE },
  });
  expect(signedUp.status()).toBe(200);

  const page = first.instructor.page;
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.getByRole("link", { name: "Learners" }).click();
  await expect(page).toHaveURL(/\/learners$/);
  const rows = page.getByTestId("learner");
  const search = async (text: string) => {
    await page.getByLabel("Name or email").fill(text);
    await page.getByRole("button", { name: "Search" }).click();
  };
  const row = (name: string) => rows.filter({ hasText: name });

  // All learners, one in no room included.
  await search(lonelyName);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(`${lonelyName.toLowerCase()}@example.test`);
  await expect(rows).toContainText("Not in any room");
  await expect(rows).toContainText("Signed up");

  await search("");
  await page.getByLabel("Room", { exact: true }).selectOption({ label: first.room.name });
  await expect(rows).toHaveCount(1);
  await expect(row(inFirst.name).getByTestId("learner-rooms")).toHaveText(`Rooms: ${first.room.name}`);
  await expect(page.getByTestId("learner-total")).toHaveText("1 learner");
  await search(inSecond.name);
  await expect(page.getByTestId("learner-total")).toHaveText("No learner found.");
  await page.getByLabel("Room", { exact: true }).selectOption({ label: second.room.name });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(inSecond.name);

  // The instructor is not a learner.
  await page.getByLabel("Room", { exact: true }).selectOption({ label: "All learners" });
  await search(first.instructor.email);
  await expect(page.getByTestId("learner-total")).toHaveText("No learner found.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await search("");
  await page.getByLabel("Room", { exact: true }).selectOption({ label: first.room.name });
  await expect(rows).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("learners.png"), fullPage: true });

  // A learner has no menu, no page and no data.
  await inFirst.page.goto("/learners");
  await expect(inFirst.page).toHaveURL(`${BASE}/`);
  await expect(inFirst.page.getByTestId("who")).toContainText(inFirst.name);
  await expect(inFirst.page.getByRole("link", { name: "Learners" })).toHaveCount(0);
  expect((await inFirst.request.get("/api/admin/learners")).status()).toBe(403);
  expect((await (await browser.newContext({ baseURL: BASE })).request.get("/api/admin/learners")).status()).toBe(401);

  await lonely.close();
  await first.close();
  await second.close();
});

test("AC31: Previous and Next ask for that page, and a new search starts at the first", async ({ browser }) => {
  const room = await classroom(browser);
  const page = room.instructor.page;
  const asked: string[] = [];
  // Made-up answers: 26 learners without 26 sign-ups. The server's paging has its own tests.
  await page.route("**/api/admin/learners?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    asked.push(query.toString());
    const number = Number(query.get("page"));
    const learner = { id: `p${number}`, name: `On page ${number}`, email: "x@example.test", createdAt: 0, rooms: [] };
    await route.fulfill({ json: { learners: [learner], page: number, pageSize: 25, total: 26 } });
  });
  await page.goto("/learners");
  const previous = page.getByRole("button", { name: "Previous" });
  const next = page.getByRole("button", { name: "Next" });
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(page.getByTestId("learner")).toContainText("On page 2");
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(page.getByTestId("learner")).toContainText("On page 1");
  await next.click();
  await expect(page.getByTestId("learner")).toContainText("On page 2");
  await page.getByLabel("Name or email").fill("a");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("learner")).toContainText("On page 1");
  expect(asked.at(-1)).toBe("page=1&q=a");
  await room.close();
});
