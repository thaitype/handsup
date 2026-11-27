/** People and rooms for the browser tests, made through the app's own API. */
import { expect, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

// Must match e2e/app/server.mjs.
export const INSTRUCTOR = "e2e-teacher@example.test";
export const PASSWORD = "correct-horse-battery-staple";
export const BASE = "http://localhost:5199";

const json = (data: unknown) => ({ data, headers: { "content-type": "application/json", origin: BASE } });
export const unique = (label: string) => `${label}-${crypto.randomUUID().slice(0, 8)}`;

async function signIn(request: APIRequestContext, email: string, name: string) {
  const up = await request.post("/api/auth/sign-up/email", json({ name, email, password: PASSWORD }));
  if (up.status() !== 200) {
    const again = await request.post("/api/auth/sign-in/email", json({ email, password: PASSWORD }));
    expect(again.status(), await again.text()).toBe(200);
  }
}

/** A person with their own browser context: `page` for the UI, `request` for the API. */
async function person(browser: Browser, email: string, name: string) {
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context.request, email, name);
  const page = await context.newPage();
  return { context, page, request: context.request, name, email };
}

export type Person = Awaited<ReturnType<typeof person>>;

export async function classroom(browser: Browser) {
  const instructor = await person(browser, INSTRUCTOR, "E2E Instructor");
  const created = await instructor.request.post("/api/rooms", json({ name: unique("Room") }));
  expect(created.status()).toBe(200);
  const room = (await created.json()) as { id: string; name: string; inviteCode: string };
  const people: Person[] = [instructor];
  const learner = async (label: string) => {
    const name = unique(label);
    const who = await person(browser, `${name}@example.test`, name);
    const joined = await who.request.post("/api/join", json({ code: room.inviteCode }));
    expect(joined.status()).toBe(200);
    people.push(who);
    return who;
  };
  const base = `/api/rooms/${room.id}`;
  return {
    room,
    instructor,
    learner,
    path: `/rooms/${room.id}`,
    async ask(who: Person, body: string, visibility: "public" | "private" = "public") {
      const response = await who.request.post(
        `${base}/questions`,
        json({ body, visibility, clientRequestId: crypto.randomUUID() }),
      );
      expect(response.status(), await response.text()).toBe(200);
      return ((await response.json()) as { question: { id: string } }).question.id;
    },
    async answer(questionId: string, body: string) {
      const response = await instructor.request.post(
        `${base}/questions/${questionId}/answers`,
        json({ body, clientRequestId: crypto.randomUUID() }),
      );
      expect(response.status(), await response.text()).toBe(200);
    },
    close: () => Promise.all(people.map((p) => p.context.close())),
  };
}

export const question = (page: Page, text: string) => page.getByTestId("question").filter({ hasText: text });

/** Presses a delete button inside `within` and confirms in the dialog it opens. */
export async function confirmDelete(page: Page, within: Locator, label: "Delete question" | "Delete answer") {
  await within.getByRole("button", { name: label }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
}

const isRoomSocket = (url: string) => /\/api\/rooms\/[^/]+\/ws$/.test(url);

/** The room sockets a page opened, with every frame it received on them. */
export function watchSockets(page: Page) {
  const seen = { opened: 0, closed: 0, frames: [] as string[] };
  page.on("websocket", (socket) => {
    if (!isRoomSocket(socket.url())) return;
    seen.opened += 1;
    socket.on("framereceived", (frame) => seen.frames.push(String(frame.payload)));
    socket.on("close", () => (seen.closed += 1));
  });
  return seen;
}

/** The times at which a page asked for the HTTP snapshot. */
export function watchSnapshots(page: Page) {
  const times: number[] = [];
  page.on("request", (request) => {
    if (/\/api\/rooms\/[^/]+\/snapshot$/.test(new URL(request.url()).pathname)) times.push(Date.now());
  });
  return times;
}
