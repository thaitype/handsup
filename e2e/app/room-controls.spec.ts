/** Confirming deletes, and the toggle that hides resolved questions on one screen. */
import { expect, test, type Page } from "@playwright/test";
import { classroom, question, unique } from "../room-support.ts";

const SOON = { timeout: 2_000 };

const watchDeletes = (page: Page) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE") sent.push(new URL(request.url()).pathname);
  });
  return sent;
};

test("deleting a question or an answer asks first, and cancelling deletes nothing", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Owner");
  const text = unique("keep");
  const reply = unique("reply");
  await room.answer(await room.ask(a, text), reply);
  const teacher = room.instructor.page;
  const deletes = [watchDeletes(a.page), watchDeletes(teacher)];
  for (const page of [a.page, teacher]) {
    await page.goto(room.path);
    await expect(question(page, text)).toContainText(reply);
  }
  const dialog = (page: Page) => page.getByRole("alertdialog");

  // The answer: cancel, then Escape, then confirm.
  const answerButton = question(teacher, text).getByRole("button", { name: "Delete answer" });
  await answerButton.click();
  await expect(dialog(teacher)).toContainText("Delete this answer?");
  await dialog(teacher).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(teacher)).toHaveCount(0);
  await answerButton.click();
  await teacher.keyboard.press("Escape");
  await expect(dialog(teacher)).toHaveCount(0);

  // The question, by its owner.
  const questionButton = question(a.page, text).getByRole("button", { name: "Delete question" });
  await questionButton.click();
  await expect(dialog(a.page)).toContainText("Delete this question?");
  await expect(dialog(a.page)).not.toContainText(text);
  await dialog(a.page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(a.page)).toHaveCount(0);

  // Nothing was sent or changed. A reload shows what the server still holds.
  expect(deletes.flat()).toEqual([]);
  await a.page.reload();
  await expect(question(a.page, text)).toContainText(reply);

  await answerButton.click();
  await dialog(teacher).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(question(a.page, text).getByTestId("answer")).toHaveCount(0, SOON);
  await expect(question(a.page, text)).toBeVisible();
  await questionButton.click();
  await dialog(a.page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(question(teacher, text)).toHaveCount(0, SOON);
  expect(deletes.map((sent) => sent.length)).toEqual([1, 1]);
  await room.close();
});

test("resolved questions can be hidden on one screen, within what presenter mode allows", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Asker");
  const b = await room.learner("Other");
  const open = unique("open");
  const done = unique("done");
  const secretOpen = unique("secretopen");
  const secretDone = unique("secretdone");
  await room.ask(a, open);
  const doneId = await room.ask(a, done);
  await room.ask(a, secretOpen, "private");
  const secretDoneId = await room.ask(a, secretDone, "private");
  const resolve = async (id: string, resolved = true) => {
    const response = await room.instructor.request.put(`/api/rooms/${room.room.id}/questions/${id}/resolved`, {
      data: { resolved },
      headers: { "content-type": "application/json", origin: "http://localhost:5199" },
    });
    expect(response.status()).toBe(200);
  };
  await resolve(doneId);
  await resolve(secretDoneId);

  const teacher = room.instructor.page;
  for (const page of [teacher, a.page, b.page]) await page.goto(room.path);
  const toggle = (page: Page) => page.getByRole("button", { name: "Show resolved" });
  const notice = (page: Page) => page.getByTestId("resolved-hidden");

  // Shown by default, to both roles.
  for (const page of [teacher, a.page, b.page]) {
    await expect(question(page, done)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(notice(page)).toHaveCount(0);
  }

  for (const [page, hidden] of [[teacher, 2], [a.page, 2], [b.page, 1]] as const) {
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect(question(page, done)).toHaveCount(0);
    await expect(question(page, secretDone)).toHaveCount(0);
    await expect(question(page, open)).toBeVisible();
    await expect(notice(page)).toContainText(`Resolved questions are hidden (${hidden}).`);
  }
  await expect(question(a.page, secretOpen)).toBeVisible();

  // Presenter mode still rules: nothing private in either position, and not in the count.
  await teacher.getByRole("button", { name: "Presenter mode" }).click();
  await expect(notice(teacher)).toContainText("Resolved questions are hidden (1).");
  const nothingPrivate = async () => {
    await expect(question(teacher, open)).toBeVisible();
    const html = await teacher.content();
    expect(html).not.toContain(secretOpen);
    expect(html).not.toContain(secretDone);
  };
  await nothingPrivate();
  await toggle(teacher).click();
  await expect(question(teacher, done)).toBeVisible();
  await nothingPrivate();
  await toggle(teacher).click();
  await nothingPrivate();

  // Another learner never gets the private ones, shown or hidden.
  await toggle(b.page).click();
  await expect(question(b.page, done)).toBeVisible();
  await expect(question(b.page, secretDone)).toHaveCount(0);
  await expect(question(b.page, secretOpen)).toHaveCount(0);

  // Live changes follow the switch: reopening brings one back, resolving hides one.
  await resolve(doneId, false);
  await expect(question(a.page, done)).toBeVisible(SOON);
  await resolve(doneId);
  await expect(question(a.page, done)).toHaveCount(0, SOON);
  await notice(a.page).getByRole("button", { name: "Show them" }).click();
  await expect(question(a.page, done)).toBeVisible();
  await expect(question(a.page, secretDone)).toBeVisible();
  await room.close();
});
