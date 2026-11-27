/** AC30: a classroom behind one address polls without being limited. */
import { describe, expect, it } from "vitest";
import { classroom, roomApi } from "./support/classroom.ts";

describe("AC30: fifty users behind one address", () => {
  it("answers every poll with 200", { timeout: 60_000 }, async () => {
    const { room, member } = await classroom();
    const api = roomApi(room.id);
    const people = [];
    for (let i = 0; i < 50; i++) people.push(await member(`P${i}`));
    for (const person of people) person.browser.address = "203.0.113.50";
    const statuses: number[] = [];
    // Two polls each is a minute at the normal pace; a third leaves room for a refresh.
    for (let round = 0; round < 3; round++) {
      const responses = await Promise.all(people.map((p) => api.snapshot(p.browser)));
      statuses.push(...responses.map((r) => r.status));
    }
    console.log("COUNT AC30", JSON.stringify({ users: people.length, polls: statuses.length }));
    expect(statuses).toEqual(Array<number>(150).fill(200));
  });
});
