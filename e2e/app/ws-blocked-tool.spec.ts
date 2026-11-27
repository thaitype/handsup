/**
 * The blocking used by Mild's step 12 window (e2e/headed) against the real app: a blocked
 * learner falls back to polling and receives no frame, while an unblocked learner in the
 * same room stays live (control).
 */
import { expect, test } from "@playwright/test";
import { blockRoomSockets } from "../block-room-sockets.ts";
import { classroom, question, unique, watchSockets } from "../room-support.ts";

const NOTICE = "โหมดสำรอง";

for (const shape of ["refused", "silent"] as const) {
  test(`blockRoomSockets (${shape}) puts the page in fallback; an unblocked page stays live`, async ({ browser }) => {
    const room = await classroom(browser);
    const blocked = await room.learner("blocked");
    const live = await room.learner("live");
    const existing = unique("existing");
    await room.ask(live, existing);

    const tool = await blockRoomSockets(blocked.context, shape);
    const blockedSockets = watchSockets(blocked.page);
    const liveSockets = watchSockets(live.page);
    await blocked.page.goto(room.path);
    await live.page.goto(room.path);

    await expect(question(blocked.page, existing)).toBeVisible({ timeout: 5_000 });
    await expect(blocked.page.getByTestId("connection")).toContainText(NOTICE, { timeout: 10_000 });
    expect(tool.count()).toBeGreaterThan(0);
    expect(blockedSockets.frames).toEqual([]);

    // Control: the same room over a real socket, live, receiving frames, no notice.
    await expect(question(live.page, existing)).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => liveSockets.frames.length).toBeGreaterThan(0);
    await expect(live.page.getByTestId("connection")).toHaveCount(0);
    await room.close();
  });
}
