/**
 * AC7 in a browser: a direct link keeps its code through sign-up or sign-in and joins only
 * when the person confirms with a POST. Spec 7.5.
 */
import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";

// Must match e2e/app/server.mjs.
const INSTRUCTOR = "e2e-teacher@example.test";
const PASSWORD = "correct-horse-battery-staple";
const STORAGE_KEY = "handsup.pendingJoinCode";

const json = (data: unknown) => ({
  data,
  headers: { "content-type": "application/json", origin: "http://localhost:5199" },
});
const uniqueEmail = (label: string) => `${label}-${crypto.randomUUID()}@example.test`;

async function signedIn(request: APIRequestContext, email: string) {
  const up = await request.post("/api/auth/sign-up/email", json({ name: "Test User", email, password: PASSWORD }));
  if (up.status() !== 200) {
    const signIn = await request.post("/api/auth/sign-in/email", json({ email, password: PASSWORD }));
    expect(signIn.status()).toBe(200);
  }
}

/** A room made by the instructor through the API. */
async function createRoom(request: APIRequestContext, name: string) {
  await signedIn(request, INSTRUCTOR);
  const response = await request.post("/api/rooms", json({ name }));
  expect(response.status()).toBe(200);
  return (await response.json()) as { id: string; name: string; inviteCode: string };
}

async function roomNames(page: Page) {
  const response = await page.request.get("/api/rooms");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { rooms: { name: string }[] }).rooms.map((r) => r.name);
}

/** Every call the page makes to /api/join, so "never joins from a GET" is measured. */
function watchJoins(page: Page) {
  const joins: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/join") joins.push(request);
  });
  return joins;
}

test("a direct link needs sign-up first, keeps its code, and joins only on confirm", async ({ page, playwright }) => {
  const instructor = await playwright.request.newContext({ baseURL: "http://localhost:5199" });
  const room = await createRoom(instructor, `Link ${crypto.randomUUID().slice(0, 8)}`);
  const joins = watchJoins(page);

  await page.goto(`/join#code=${room.inviteCode}`);
  await expect(page.getByTestId("pending-code")).toHaveText(room.inviteCode);
  await expect(page.getByText("Sign in or create an account first")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY)).toBe(room.inviteCode);

  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Link Learner");
  await page.getByLabel("Email").fill(uniqueEmail("link"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Back on the confirmation, signed in, and not a member yet.
  await expect(page).toHaveURL(/\/join$/);
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
  expect(await roomNames(page)).toEqual([]);
  expect(joins).toHaveLength(0);

  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("room")).toHaveText([room.name]);
  expect(joins.map((r) => r.method())).toEqual(["POST"]);
  expect(await roomNames(page)).toEqual([room.name]);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await instructor.dispose();
});

test("an existing learner signs in from the link and confirms", async ({ page, playwright }) => {
  const instructor = await playwright.request.newContext({ baseURL: "http://localhost:5199" });
  const room = await createRoom(instructor, `SignIn ${crypto.randomUUID().slice(0, 8)}`);
  const email = uniqueEmail("existing");
  const other = await playwright.request.newContext({ baseURL: "http://localhost:5199" });
  await signedIn(other, email);
  await other.dispose();

  await page.goto(`/join#code=${room.inviteCode.toLowerCase()}`);
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
  // Reloading the confirmation is still a GET: nothing joins.
  await page.reload();
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
  expect(await roomNames(page)).toEqual([]);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByTestId("room")).toHaveText([room.name]);
  await instructor.dispose();
});

test("a link with a rotated code is refused, and the new link works", async ({ page, playwright }) => {
  const instructor = await playwright.request.newContext({ baseURL: "http://localhost:5199" });
  const room = await createRoom(instructor, `Rotated ${crypto.randomUUID().slice(0, 8)}`);
  const rotated = await instructor.post(`/api/rooms/${room.id}/invite-code/rotate`, json({}));
  const { inviteCode } = (await rotated.json()) as { inviteCode: string };
  await signedIn(page.request, uniqueEmail("rotated"));

  await page.goto(`/join#code=${room.inviteCode}`);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByText("This invite code does not work")).toBeVisible();
  expect(await roomNames(page)).toEqual([]);

  await page.goto(`/join#code=${inviteCode}`);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByTestId("room")).toHaveText([room.name]);
  await instructor.dispose();
});

test("the instructor creates a room in the page and sees its code and direct link", async ({ page }) => {
  await signedIn(page.request, INSTRUCTOR);
  await page.goto("/");
  const name = `Made in UI ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Room name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  const item = page.getByTestId("room").filter({ hasText: name });
  await expect(item).toBeVisible();
  const code = (await item.getByTestId("invite-code").textContent()) ?? "";
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  await expect(item.getByTestId("direct-link")).toHaveText(`http://localhost:5199/join#code=${code}`);
});

test("the auth error page explains account_not_linked and stays generic otherwise", async ({ page }) => {
  await page.goto("/auth/error?error=account_not_linked");
  await expect(page.getByTestId("account-not-linked")).toContainText("only the way its account was first created");
  await page.goto("/auth/error?error=state_mismatch");
  await expect(page.getByTestId("generic-error")).toBeVisible();
  await expect(page.getByTestId("account-not-linked")).toHaveCount(0);
});

test("signing out drops a join code that was never confirmed", async ({ page, playwright }) => {
  const instructor = await playwright.request.newContext({ baseURL: "http://localhost:5199" });
  const room = await createRoom(instructor, `SignOut ${crypto.randomUUID().slice(0, 8)}`);
  await signedIn(page.request, uniqueEmail("leaves"));
  const stored = () => page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEY);

  await page.goto(`/join#code=${room.inviteCode}`);
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
  // Control: the code is waiting before sign-out.
  expect(await stored()).toBe(room.inviteCode);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await stored()).toBeNull();

  // The next person to sign in in this tab lands on their rooms, not on the old confirmation.
  const next = uniqueEmail("next");
  const nextContext = await playwright.request.newContext({ baseURL: "http://localhost:5199" });
  await signedIn(nextContext, next);
  await nextContext.dispose();
  await page.getByLabel("Email").fill(next);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await roomNames(page)).toEqual([]);
  await instructor.dispose();
});
