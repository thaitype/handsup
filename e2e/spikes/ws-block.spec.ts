/**
 * Spike for spec 8.6 and AC27 to AC29: can a test block a page's WebSocket, both ways?
 * Every "received nothing" check runs beside an unblocked page that does receive.
 */
import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import { startServer } from "./ws-server.ts";

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server;
test.beforeEach(async () => {
  server = await startServer();
});
test.afterEach(async () => {
  await server.close();
});

async function open(browser: Browser, route?: (socket: WebSocketRoute) => void) {
  const page = await (await browser.newContext()).newPage();
  const frames: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => frames.push(String(frame.payload)));
  });
  if (route) await page.routeWebSocket(/\/ws$/, route);
  await page.goto(server.url);
  return { page, frames };
}

const log = (page: Page) => page.evaluate(() => (window as unknown as { log: string[] }).log);
const LIVE = ["open", "message:snapshot", "message:pong"];

/** Waits for the unblocked page to receive, then gives the blocked one the same time again. */
async function afterControlReceives(control: Page) {
  await expect.poll(() => log(control)).toEqual(LIVE);
  await control.waitForTimeout(1_500);
}

test("the connection fails: no open, no frame, server never reached", async ({ browser }) => {
  const blocked = await open(browser, (socket) => void socket.close({ code: 3001 }));
  await expect.poll(() => log(blocked.page)).toEqual(["close:3001"]);
  expect(server.connections()).toBe(0);

  const control = await open(browser);
  await afterControlReceives(control.page);

  // No "open" and also no "error": the client must treat a close before the first message as failure.
  expect(await log(blocked.page)).toEqual(["close:3001"]);
  expect(blocked.frames).toEqual([]);
  expect(control.frames).toEqual(["snapshot", "pong"]);
  expect(server.connections()).toBe(1);
});

test("the socket opens but stays silent: no frame at all, not even pong", async ({ browser }) => {
  const blocked = await open(browser, () => {});
  await expect.poll(() => log(blocked.page)).toEqual(["open"]);

  const control = await open(browser);
  await afterControlReceives(control.page);

  expect(await log(blocked.page)).toEqual(["open"]);
  expect(blocked.frames).toEqual([]);
  expect(control.frames).toEqual(["snapshot", "pong"]);
  expect(server.connections()).toBe(1);
});

test("unblocking lets the next socket through to the server", async ({ browser }) => {
  let isBlocked = true;
  const { page } = await open(browser, (socket) => {
    if (isBlocked) void socket.close({ code: 3001 });
    else socket.connectToServer();
  });
  await expect.poll(() => log(page)).toEqual(["close:3001"]);

  isBlocked = false;
  await page.evaluate(() => (window as unknown as { open_socket(): void }).open_socket());

  await expect.poll(() => log(page)).toEqual(["close:3001", ...LIVE]);
  expect(server.connections()).toBe(1);
});
