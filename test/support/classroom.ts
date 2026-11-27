/**
 * A room with an instructor and learners, all made through the real Worker entry point.
 * The instructor is an address in the test binding INSTRUCTOR_EMAILS, so the Worker and the
 * room object both read the same list, as they do in production.
 */
import { env } from "cloudflare:workers";
import { expect } from "vitest";
import type { QuestionView, SnapshotMessage, Visibility } from "../../src/shared/protocol.ts";
import { Browser, uniqueEmail } from "./http.ts";

export const INSTRUCTOR_EMAIL = "teacher@example.test";
export const INSTRUCTOR_NAME = "Instructor Ida";

export async function instructorBrowser() {
  const browser = new Browser();
  const response = await browser.signUp(INSTRUCTOR_EMAIL, INSTRUCTOR_NAME);
  if (response.status !== 200) expect((await browser.signIn(INSTRUCTOR_EMAIL)).status).toBe(200);
  return browser;
}

export type Learner = { browser: Browser; email: string; name: string };

/** The instructor account is shared within a test file, so a test may start a fresh window. */
export const resetPostLimit = () => env.DB.prepare("delete from post_attempt").run();

export async function classroom(name = "Class") {
  await resetPostLimit();
  const instructor = await instructorBrowser();
  const created = await instructor.fetch("/api/rooms", { name });
  expect(created.status).toBe(200);
  const room = (await created.json()) as { id: string; name: string; inviteCode: string };

  const signedUp = async (label: string, fullName = `${label} ${crypto.randomUUID()}`): Promise<Learner> => {
    const browser = new Browser();
    const email = uniqueEmail(label.toLowerCase().replace(/[^a-z]/g, "") || "learner");
    expect((await browser.signUp(email, fullName)).status).toBe(200);
    return { browser, email, name: fullName };
  };
  const member = async (label: string, fullName?: string) => {
    const learner = await signedUp(label, fullName);
    expect((await learner.browser.fetch("/api/join", { code: room.inviteCode })).status).toBe(200);
    return learner;
  };
  return {
    room,
    instructor,
    member,
    outsider: signedUp,
    guest: new Browser(),
    stub: env.ROOM.get(env.ROOM.idFromName(room.id)),
  };
}

const write = (browser: Browser, method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
  browser.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });

/** The room API of spec 8.5, as a browser calls it. */
export const roomApi = (roomId: string) => {
  const base = `/api/rooms/${roomId}`;
  return {
    snapshot: (b: Browser) => b.fetch(`${base}/snapshot`),
    ask: (b: Browser, body: string, visibility: Visibility = "public", clientRequestId: string = crypto.randomUUID()) =>
      write(b, "POST", `${base}/questions`, { body, visibility, clientRequestId }),
    answer: (b: Browser, qid: string, body: string, clientRequestId: string = crypto.randomUUID()) =>
      write(b, "POST", `${base}/questions/${qid}/answers`, { body, clientRequestId }),
    resolve: (b: Browser, qid: string, resolved = true) =>
      write(b, "PUT", `${base}/questions/${qid}/resolved`, { resolved }),
    removeQuestion: (b: Browser, qid: string) => write(b, "DELETE", `${base}/questions/${qid}`),
    removeAnswer: (b: Browser, qid: string, aid: string) =>
      write(b, "DELETE", `${base}/questions/${qid}/answers/${aid}`),
  };
};

/** The body of a write that must have succeeded. */
export async function questionFrom(response: Response): Promise<QuestionView> {
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return (JSON.parse(text) as { question: QuestionView }).question;
}

export async function snapshotFrom(response: Response): Promise<SnapshotMessage> {
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as SnapshotMessage;
}

/** Status, headers and body as one string: everything the response tells the caller. */
export async function everything(response: Response) {
  const body = await response.text();
  return { status: response.status, body, all: `${response.status}\n${[...response.headers]}\n${body}` };
}
