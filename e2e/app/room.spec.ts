/** The room page against the real app: AC8, AC16 (every tab) and safe retries. */
import { expect, test } from "@playwright/test";
import { classroom, PASSWORD, question, unique, watchSnapshots, watchSockets } from "../room-support.ts";

const SOON = { timeout: 2_000 };

test("AC8: questions, answers, resolved and deletes reach every screen that may see them", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("AskerA");
  const b = await room.learner("OtherB");
  const screens = [room.instructor, a, b];
  const snapshots = screens.map((p) => watchSnapshots(p.page));
  const sockets = screens.map((p) => watchSockets(p.page));
  for (const p of screens) {
    await p.page.goto(room.path);
    await expect(p.page.getByTestId("room-name")).toHaveText(room.room.name);
  }
  const [teacher, asker, other] = screens.map((p) => p.page) as [typeof a.page, typeof a.page, typeof a.page];

  const hidden = unique("private");
  await asker.getByLabel("Your question").fill(hidden);
  await asker.getByLabel("ถามส่วนตัว (ผู้สอนเห็นชื่อคุณ)").check();
  await asker.getByRole("button", { name: "Ask" }).click();
  await expect(question(teacher, hidden)).toBeVisible(SOON);
  await expect(question(teacher, hidden).getByTestId("asker")).toHaveText(a.name);
  await expect(question(asker, hidden).getByTestId("asker")).toHaveText("คุณ", SOON);

  const open = unique("public");
  await asker.getByLabel("Your question").fill(open);
  await asker.getByLabel("ถามแบบ public").check();
  await asker.getByRole("button", { name: "Ask" }).click();
  for (const page of [teacher, asker, other]) await expect(question(page, open)).toBeVisible(SOON);
  // B has the public one that was posted after the private one, and not the private one.
  await expect(question(other, hidden)).toHaveCount(0);

  const reply = unique("answer");
  const card = question(teacher, open);
  await card.getByLabel("Your answer").fill(reply);
  await card.getByRole("button", { name: "Answer", exact: true }).click();
  for (const page of [asker, other]) await expect(question(page, open).getByTestId("answer")).toContainText(reply, SOON);
  await card.getByRole("button", { name: "Mark resolved" }).click();
  for (const page of [asker, other]) await expect(question(page, open).getByTestId("resolved")).toBeVisible(SOON);
  await card.getByRole("button", { name: "Delete answer" }).click();
  for (const page of [asker, other]) await expect(question(page, open).getByTestId("answer")).toHaveCount(0, SOON);
  await card.getByRole("button", { name: "Delete question" }).click();
  for (const page of [teacher, asker, other]) await expect(question(page, open)).toHaveCount(0, SOON);

  // A learner has no instructor controls, and only the owner may delete.
  await expect(other.getByRole("button", { name: "Mark resolved" })).toHaveCount(0);
  await expect(other.getByLabel("Your answer")).toHaveCount(0);
  await question(asker, hidden).getByRole("button", { name: "Delete question" }).click();
  await expect(question(teacher, hidden)).toHaveCount(0, SOON);

  // All of it came over the sockets: nobody polled, and B's frames never held the private text.
  expect(snapshots.map((times) => times.length)).toEqual([0, 0, 0]);
  expect(sockets.every((s) => s.frames.length > 0)).toBe(true);
  expect(sockets[2]!.frames.join()).toContain(open);
  expect(sockets[2]!.frames.join()).not.toContain(hidden);
  await expect(other.getByTestId("connection")).toHaveCount(0);
  await room.close();
});

test("AC16: signing out closes the room in every tab, and another session carries on", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Leaver");
  const b = await room.learner("Poster");
  // A second session of the same person, on another device.
  const elsewhere = await browser.newContext({ baseURL: "http://localhost:5199" });
  const elsewherePage = await elsewhere.newPage();
  await elsewherePage.goto("/sign-in");
  await elsewherePage.getByLabel("Email").fill(a.email);
  await elsewherePage.getByLabel("Password").fill(PASSWORD);
  await elsewherePage.getByRole("button", { name: "Sign in" }).click();
  await expect(elsewherePage.getByTestId("who")).toContainText(a.name);

  const tabs = [a.page, await a.context.newPage()];
  const sockets = tabs.map((tab) => watchSockets(tab));
  for (const page of [...tabs, elsewherePage]) {
    await page.goto(room.path);
    await expect(page.getByTestId("room-name")).toHaveText(room.room.name);
  }
  const before = unique("before");
  await room.ask(b, before);
  for (const page of [...tabs, elsewherePage]) await expect(question(page, before)).toBeVisible(SOON);

  await tabs[0]!.getByRole("button", { name: "Sign out" }).click();
  for (const tab of tabs) await expect(tab).toHaveURL(/\/sign-in$/, SOON);
  await expect.poll(() => sockets.map((s) => s.opened - s.closed), SOON).toEqual([0, 0]);
  const heard = sockets.map((s) => s.frames.length);

  const after = unique("after");
  await room.ask(b, after);
  await expect(question(elsewherePage, after)).toBeVisible(SOON);
  expect(sockets.map((s) => s.frames.length)).toEqual(heard);
  for (const tab of tabs) await expect(tab.getByTestId("question")).toHaveCount(0);
  await elsewhere.close();
  await room.close();
});

test("trying a post again after its answer was lost does not post twice", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Retry");
  const page = a.page;
  await page.goto(room.path);
  await expect(page.getByTestId("room-name")).toHaveText(room.room.name);
  // The server takes the first post, and the browser never hears.
  let lose = true;
  const sent: string[] = [];
  await page.route("**/api/rooms/*/questions", async (route) => {
    sent.push((route.request().postDataJSON() as { clientRequestId: string }).clientRequestId);
    if (!lose) return route.continue();
    lose = false;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort();
  });
  const text = unique("once");
  await page.getByLabel("Your question").fill(text);
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("That did not work")).toBeVisible();
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByLabel("Your question")).toHaveValue("");
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  await page.reload();
  await expect(question(page, text)).toHaveCount(1);
  await room.close();
});
