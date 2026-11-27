/** People for room tests, signed up through the real app with their own instructor list. */
import { env } from "cloudflare:workers";
import app from "../../src/worker/index.ts";
import { Browser, uniqueEmail } from "./http.ts";

export type Room = { id: string; name: string; inviteCode: string; createdAt: number };

/** A browser whose requests reach the app with `list.value` as INSTRUCTOR_EMAILS. */
export const browserWith = (list: { value: string }) =>
  new Browser(async (request) => app.fetch(request, { ...env, INSTRUCTOR_EMAILS: list.value }));

export async function people() {
  const instructorEmail = uniqueEmail("instructor");
  const list = { value: instructorEmail };
  const signedUp = async (email: string) => {
    const browser = browserWith(list);
    const response = await browser.signUp(email);
    if (response.status !== 200) throw new Error(`sign-up ${email}: ${response.status}`);
    return browser;
  };
  const instructor = await signedUp(instructorEmail);
  const createRoom = async (name = "Room") => {
    const response = await instructor.fetch("/api/rooms", { name });
    if (response.status !== 200) throw new Error(`create room: ${response.status}`);
    return (await response.json()) as Room;
  };
  return {
    list,
    instructor,
    instructorEmail,
    guest: browserWith(list),
    learner: (label = "learner") => signedUp(uniqueEmail(label)),
    createRoom,
  };
}

export const roomIds = async (browser: Browser) => {
  const response = await browser.fetch("/api/rooms");
  if (response.status !== 200) return response.status;
  const { rooms } = (await response.json()) as { rooms: { id: string }[] };
  return rooms.map((room) => room.id);
};
