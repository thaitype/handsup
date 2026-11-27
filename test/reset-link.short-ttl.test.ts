/** AC15: the link the admin API returns expires. The lifetime is 3 seconds in this project. */
import { describe, expect, it } from "vitest";
import { instructorBrowser } from "./support/classroom.ts";
import { Browser, uniqueEmail } from "./support/http.ts";
import { createLink, redeem, tokenFrom, userId } from "./support/reset.ts";

describe("an admin reset link and real time", () => {
  it("works before it expires and not after", { timeout: 20_000 }, async () => {
    const instructor = await instructorBrowser();
    const email = uniqueEmail("expiry");
    await new Browser().signUp(email);
    const id = await userId(email);

    const used = await createLink(instructor, id);
    expect(await used.clone().json()).toMatchObject({ expiresInSeconds: 3 });
    expect((await redeem(await tokenFrom(used), "first-new-password")).status).toBe(200);

    const stale = await tokenFrom(await createLink(instructor, id));
    await scheduler.wait(3_500);
    const late = await redeem(stale, "second-new-password");
    expect(late.status).toBe(400);
    expect(await late.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await new Browser().signIn(email, "first-new-password")).status).toBe(200);
    expect((await new Browser().signIn(email, "second-new-password")).status).toBe(401);
  });
});
