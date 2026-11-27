/** The socket stays alive on its own: ping is answered without waking the object (spec 8.2). */
import { describe, expect, it } from "vitest";
import { classroom } from "./support/classroom.ts";
import { connect } from "./support/socket.ts";

describe("RoomDO sockets", () => {
  it("answers ping with pong", async () => {
    const { room, member } = await classroom();
    const client = await connect((await member("A")).browser, room.id);
    client.socket.send("ping");
    await client.received("pong");
    expect(client.frames.at(-1)).toBe("pong");
    expect(client.closes).toEqual([]);
    client.socket.close(1000);
  });
});
