import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { connect } from "./support/socket.ts";

type Marked = { inMemoryMarker?: string };

describe("RoomDO eviction", () => {
  it("really drops memory, and the same socket still receives an event", async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName(crypto.randomUUID()));
    const client = await connect(stub);
    const readMarker = () =>
      runInDurableObject(stub, (room) => (room as unknown as Marked).inMemoryMarker);

    expect(await stub.broadcast("before")).toBe(1);
    await vi.waitFor(() => expect(client.messages).toEqual(["before"]));

    // The marker lives only on this instance. It survives an ordinary later call.
    await runInDurableObject(stub, (room) => {
      (room as unknown as Marked).inMemoryMarker = "set before eviction";
    });
    expect(await readMarker()).toBe("set before eviction");

    await evictDurableObject(stub);

    expect(await readMarker()).toBeUndefined();
    expect(await stub.broadcast("after")).toBe(1);
    await vi.waitFor(() => expect(client.messages).toEqual(["before", "after"]));
    expect(client.closes).toEqual([]);
    client.socket.close(1000);
  });

  it("answers ping with pong", async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName(crypto.randomUUID()));
    const client = await connect(stub);
    client.socket.send("ping");
    await vi.waitFor(() => expect(client.messages).toEqual(["pong"]));
    client.socket.close(1000);
  });
});
