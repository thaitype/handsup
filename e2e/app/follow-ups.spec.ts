/** The asker writes under their own question, live and when the socket is blocked. */
import { expect, test } from "@playwright/test";
import { blockRoomSockets } from "../block-room-sockets.ts";
import { classroom, confirmDelete, question, unique, watchSockets } from "../room-support.ts";

const SOON = { timeout: 2_000 };

test("the asker follows up in a private thread that only the instructor also sees", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Asker");
  const b = await room.learner("Other");
  const text = unique("private");
  const reply = unique("reply");
  const open = unique("open");
  const id = await room.ask(a, text, "private");
  await room.ask(a, open);
  await room.answer(id, reply);
  const teacher = room.instructor.page;
  const heard = watchSockets(b.page);
  for (const page of [teacher, a.page, b.page]) await page.goto(room.path);
  await expect(question(b.page, open)).toBeVisible();

  const followUp = unique("followup");
  await question(a.page, text).getByLabel("Add a message").fill(followUp);
  await question(a.page, text).getByRole("button", { name: "Send" }).click();
  const messages = question(teacher, text).getByTestId("answer");
  await expect(messages).toHaveCount(2, SOON);
  await expect(messages.nth(0)).toContainText(reply);
  await expect(messages.nth(0).getByTestId("instructor-mark")).toBeVisible();
  await expect(messages.nth(1)).toContainText(followUp);
  await expect(messages.nth(1).getByTestId("message-author")).toHaveText(a.name);
  await expect(messages.nth(1).getByTestId("instructor-mark")).toHaveCount(0);
  const own = question(a.page, text).getByTestId("answer");
  await expect(own.nth(1).getByTestId("message-author")).toHaveText("คุณ");
  // The asker may delete their own message only.
  await expect(own.nth(0).getByRole("button")).toHaveCount(0);

  // B has no way to write under A's public question, and heard nothing of the private thread.
  await expect(question(b.page, open)).toBeVisible();
  await expect(b.page.getByLabel("Add a message")).toHaveCount(0);
  expect(heard.frames.join()).toContain(open);
  expect(heard.frames.join()).not.toContain(followUp);
  expect(await b.page.content()).not.toContain(followUp);

  await teacher.getByRole("button", { name: "Presenter mode" }).click();
  await expect(question(teacher, open)).toBeVisible();
  expect(await teacher.content()).not.toContain(followUp);
  await teacher.getByRole("button", { name: "Presenter mode" }).click();

  await own.nth(1).getByRole("button", { name: "Delete message" }).click();
  await a.page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(messages).toHaveCount(2);
  await confirmDelete(a.page, own.nth(1), "Delete message");
  await expect(messages).toHaveCount(1, SOON);
  await room.close();
});

test("follow-ups work with the socket blocked", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Polling");
  const text = unique("private");
  const id = await room.ask(a, text, "private");
  await room.answer(id, unique("reply"));
  await blockRoomSockets(a.context, "refused");
  await a.page.goto(room.path);
  await expect(a.page.getByTestId("connection")).toBeVisible();
  const card = question(a.page, text);
  await expect(card.getByTestId("answer")).toHaveCount(1);
  const followUp = unique("followup");
  await card.getByLabel("Add a message").fill(followUp);
  await card.getByRole("button", { name: "Send" }).click();
  await expect(card.getByTestId("answer")).toHaveCount(2, SOON);
  // What the instructor adds arrives by the next poll or a refresh.
  const more = unique("more");
  await room.answer(id, more);
  await a.page.reload();
  await expect(card.getByTestId("answer")).toHaveCount(3, { timeout: 5_000 });
  await expect(card.getByTestId("answer").nth(2)).toContainText(more);
  await room.close();
});
