/**
 * Spec 8.6 against the real app, in real time: AC27, AC28 and AC29. The socket is blocked
 * from the test's side only; the app has no switch for it.
 */
import { expect, test, type Page } from "@playwright/test";
import { classroom, question, unique, watchSnapshots, watchSockets } from "../room-support.ts";

const ROOM_SOCKET = /\/api\/rooms\/[^/]+\/ws$/;
const NOTICE = "โหมดสำรอง: อัปเดตประมาณทุก 30 วินาที รีเฟรชเพื่อดูทันที";
const NEXT_POLL = { timeout: 40_000 };
const SOON = { timeout: 2_000 };

type Block = { on: boolean };

/** "refused": closed before anything arrives. "silent": opens and never says a word. */
async function blockSockets(page: Page, shape: "refused" | "silent", block: Block = { on: true }) {
  await page.routeWebSocket(ROOM_SOCKET, (socket) => {
    if (!block.on) socket.connectToServer();
    else if (shape === "refused") void socket.close({ code: 3001 });
  });
  return block;
}

for (const shape of ["refused", "silent"] as const) {
  test(`AC27: the room works with the socket ${shape} from the start`, async ({ browser }) => {
    const room = await classroom(browser);
    const a = await room.learner("A");
    const b = await room.learner("B");
    const existing = unique("existing");
    await room.ask(a, existing);

    const page = b.page;
    const sockets = watchSockets(page);
    const snapshots = watchSnapshots(page);
    const answers: string[] = [];
    page.on("response", async (response) => {
      if (response.url().endsWith("/snapshot")) answers.push(await response.text().catch(() => ""));
    });
    await blockSockets(page, shape);
    await page.goto(room.path);
    await expect(question(page, existing)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("connection")).toContainText(NOTICE);
    await expect(page.getByTestId("updated-at")).toBeVisible();

    const hidden = unique("private");
    const fresh = unique("fresh");
    await room.ask(a, hidden, "private");
    await room.ask(a, fresh);
    await expect(question(page, fresh)).toBeVisible(NEXT_POLL);
    await expect(question(page, hidden)).toHaveCount(0);

    const latest = unique("latest");
    await room.ask(a, latest);
    await page.reload();
    await expect(question(page, latest)).toBeVisible({ timeout: 5_000 });

    // About every 30 seconds, and no more often.
    const from = Date.now();
    await page.waitForTimeout(90_000);
    const inWindow = snapshots.filter((time) => time >= from && time < from + 90_000).length;
    console.log(`COUNT AC27 ${shape}: ${inWindow} snapshot requests in 90 s`);
    expect(inWindow).toBeGreaterThanOrEqual(2);
    expect(inWindow).toBeLessThanOrEqual(4);

    // Control: the socket really delivered nothing, and the snapshots did carry the data.
    expect(sockets.frames).toEqual([]);
    expect(answers.join()).toContain(fresh);
    expect(answers.join()).not.toContain(hidden);
    await expect(page.getByTestId("connection")).toContainText(NOTICE);
    await room.close();
  });
}

test("AC28: your own writes show at once, and an older snapshot cannot undo them", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("Writer");
  const other = await room.learner("Other");
  const learner = a.page;
  const teacher = room.instructor.page;
  const polls = [watchSnapshots(learner), watchSnapshots(teacher)];

  /** Holds the next snapshot request: the server answers now, the page hears it later. */
  let hold: { captured: () => void; release: Promise<void> } | null = null;
  await learner.route("**/api/rooms/*/snapshot", async (route) => {
    const held = hold;
    hold = null;
    if (!held) return route.continue();
    const response = await route.fetch();
    held.captured();
    await held.release;
    await route.fulfill({ response });
  });
  const holdNextPoll = async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await new Promise<void>((captured) => (hold = { captured, release: released }));
    return release;
  };

  for (const page of [learner, teacher]) {
    await blockSockets(page, "refused");
    await page.goto(room.path);
    await expect(page.getByTestId("connection")).toContainText(NOTICE);
    await expect(page.getByTestId("room-name")).toHaveText(room.room.name);
  }

  const kept = unique("kept");
  const doomed = unique("doomed");
  await room.ask(a, doomed);
  await learner.reload();
  await expect(question(learner, doomed)).toBeVisible({ timeout: 5_000 });

  // Post while an earlier snapshot is on its way.
  let release = await holdNextPoll();
  let before = polls[0]!.length;
  await learner.getByLabel("Your question").fill(kept);
  await learner.getByRole("button", { name: "Ask" }).click();
  await expect(question(learner, kept)).toBeVisible(SOON);
  expect(polls[0]!.length).toBe(before);
  release();
  await learner.waitForTimeout(1_500);
  await expect(question(learner, kept)).toBeVisible();

  // Delete while an earlier snapshot, which still has it, is on its way.
  release = await holdNextPoll();
  before = polls[0]!.length;
  await question(learner, doomed).getByRole("button", { name: "Delete question" }).click();
  await expect(question(learner, doomed)).toHaveCount(0, SOON);
  expect(polls[0]!.length).toBe(before);
  release();
  await learner.waitForTimeout(1_500);
  await expect(question(learner, doomed)).toHaveCount(0);

  // Control: the following snapshot is applied as usual.
  const news = unique("news");
  await room.ask(other, news);
  await expect(question(learner, news)).toBeVisible(NEXT_POLL);

  // The instructor's writes.
  await teacher.reload();
  const card = question(teacher, kept);
  await expect(card).toBeVisible({ timeout: 5_000 });
  const reply = unique("reply");
  before = polls[1]!.length;
  await card.getByLabel("Your answer").fill(reply);
  await card.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(card.getByTestId("answer")).toContainText(reply, SOON);
  await card.getByRole("button", { name: "Mark resolved" }).click();
  await expect(card.getByTestId("resolved")).toBeVisible(SOON);
  await card.getByRole("button", { name: "Delete answer" }).click();
  await expect(card.getByTestId("answer")).toHaveCount(0, SOON);
  await card.getByRole("button", { name: "Delete question" }).click();
  await expect(card).toHaveCount(0, SOON);
  // None of that waited for a poll.
  expect(polls[1]!.length - before).toBeLessThanOrEqual(1);
  await room.close();
});

test("AC29: once the socket works again the page goes back to it and stops polling", async ({ browser }) => {
  const room = await classroom(browser);
  const a = await room.learner("A");
  const b = await room.learner("B");
  const page = b.page;
  const sockets = watchSockets(page);
  const snapshots = watchSnapshots(page);
  const block = await blockSockets(page, "refused");
  await page.goto(room.path);
  await expect(page.getByTestId("connection")).toContainText(NOTICE);
  // Control: it is polling while blocked.
  await expect.poll(() => snapshots.length, NEXT_POLL).toBeGreaterThanOrEqual(2);
  expect(sockets.frames).toEqual([]);

  block.on = false;
  await expect(page.getByTestId("connection")).toHaveCount(0, NEXT_POLL);
  const stopped = snapshots.length;
  await page.waitForTimeout(70_000);
  expect(snapshots.length).toBe(stopped);

  const live = unique("live");
  await room.ask(a, live);
  await expect(question(page, live)).toBeVisible(SOON);
  expect(sockets.frames.join()).toContain(live);
  await room.close();
});

test("polling pauses while the page is hidden and resumes at once", async ({ browser }) => {
  const room = await classroom(browser);
  const b = await room.learner("Hidden");
  const page = b.page;
  const snapshots = watchSnapshots(page);
  await page.addInitScript(() => {
    let state = "visible";
    Object.defineProperty(document, "visibilityState", { get: () => state });
    (window as unknown as { setVisibility(v: string): void }).setVisibility = (value) => {
      state = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  const setVisibility = (value: string) =>
    page.evaluate((v) => (window as unknown as { setVisibility(v: string): void }).setVisibility(v), value);
  await blockSockets(page, "refused");
  await page.goto(room.path);
  await expect.poll(() => snapshots.length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_000);
  await setVisibility("hidden");
  const paused = snapshots.length;
  await page.waitForTimeout(45_000);
  expect(snapshots.length).toBe(paused);
  await setVisibility("visible");
  await expect.poll(() => snapshots.length, SOON).toBe(paused + 1);
  await room.close();
});

test("a session ended elsewhere sends a polling page to sign-in", async ({ browser }) => {
  const room = await classroom(browser);
  const b = await room.learner("Revoked");
  const page = b.page;
  const snapshots = watchSnapshots(page);
  await blockSockets(page, "refused");
  await page.goto(room.path);
  await expect(page.getByTestId("room-name")).toHaveText(room.room.name);
  // Signed out through the API, so no tab is told.
  const out = await b.request.post("/api/auth/sign-out", {
    data: {},
    headers: { "content-type": "application/json", origin: "http://localhost:5199" },
  });
  expect(out.status()).toBe(200);
  await expect(page).toHaveURL(/\/sign-in$/, NEXT_POLL);
  const stopped = snapshots.length;
  await page.waitForTimeout(40_000);
  expect(snapshots.length).toBe(stopped);
  await room.close();
});
