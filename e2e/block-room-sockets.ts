/**
 * Blocks the room WebSocket of every page in a browser context, from the browser's side
 * (Playwright routeWebSocket, as in the M0 spikes). The app has no switch for this.
 *   "refused": the socket closes before anything arrives.
 *   "silent":  the socket opens and never receives a frame, not even pong.
 */
import type { BrowserContext } from "@playwright/test";

export const ROOM_SOCKET = /\/api\/rooms\/[^/]+\/ws$/;
export type BlockShape = "refused" | "silent";

export async function blockRoomSockets(
  context: BrowserContext,
  shape: BlockShape,
  log: (line: string) => void = () => {},
) {
  let blocked = 0;
  await context.routeWebSocket(ROOM_SOCKET, (socket) => {
    blocked += 1;
    log(`blocked (${shape}) room WebSocket #${blocked}: ${socket.url()}`);
    // Not calling connectToServer() keeps the server out of it in both shapes.
    if (shape === "refused") void socket.close({ code: 3001, reason: "blocked by test" });
  });
  return { count: () => blocked };
}
