/** A learner's or instructor's socket to a room, opened through the real Worker route. */
import { expect, vi } from "vitest";
import type { ServerMessage } from "../../src/shared/protocol.ts";
import type { Browser } from "./http.ts";

export const upgrade = (browser: Browser, roomId: string, origin?: string | null) =>
  browser.request(`/api/rooms/${roomId}/ws`, { method: "GET", headers: { Upgrade: "websocket" } }, origin);

export async function connect(browser: Browser, roomId: string) {
  const response = await upgrade(browser, roomId);
  const socket = response.webSocket;
  if (!socket) throw new Error(`upgrade failed with ${response.status} ${await response.text()}`);
  /** Every frame as received, which is everything this socket was told. */
  const frames: string[] = [];
  const closes: number[] = [];
  socket.addEventListener("message", (event) => {
    frames.push(String(event.data));
  });
  socket.addEventListener("close", (event) => {
    closes.push(event.code);
  });
  socket.accept();
  const messages = () => frames.filter((f) => f !== "pong").map((f) => JSON.parse(f) as ServerMessage);
  /** Waits until a frame carrying `text` has arrived. */
  const received = (text: string) =>
    vi.waitFor(() => expect(frames.join("\n")).toContain(text), { timeout: 2_000, interval: 5 });
  // Spec 8.1: the snapshot is the first thing a socket hears.
  await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 2_000, interval: 5 });
  return { socket, frames, closes, messages, received };
}

export type RoomSocket = Awaited<ReturnType<typeof connect>>;
