/**
 * Spec 10.5 step 12 for Mild: a real browser window on the running app with the room
 * WebSocket blocked, to watch the polling fallback (spec 8.6). Not part of any test run.
 *
 *   pnpm dev                                              # in one terminal
 *   pnpm exec playwright test -c playwright.headed.config.ts   # in another
 *
 * Sign in in the window that opens, open a room and wait about 30 seconds. Close the
 * window to finish. HANDSUP_URL picks another address; HANDSUP_WS_BLOCK=silent makes the
 * socket open but stay quiet instead of failing to connect.
 */
import { test } from "@playwright/test";
import { blockRoomSockets, type BlockShape } from "../block-room-sockets.ts";

const shape: BlockShape = process.env.HANDSUP_WS_BLOCK === "silent" ? "silent" : "refused";

test("browse the app with the room WebSocket blocked", async ({ context, page }) => {
  test.setTimeout(0);
  await blockRoomSockets(context, shape, (line) => console.log(line));
  const url = process.env.HANDSUP_URL ?? "http://localhost:5173";
  await page.goto(url);
  console.log(`opened ${url} with room WebSockets ${shape}; close the window to finish`);
  await page.waitForEvent("close", { timeout: 0 });
});
