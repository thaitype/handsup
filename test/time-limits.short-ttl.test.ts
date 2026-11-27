import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { authOptions } from "../src/worker/auth.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";
import { classroom, questionFrom, roomApi } from "./support/classroom.ts";
import { connect } from "./support/socket.ts";

describe("time limits set to seconds", () => {
  it("expires a socket after real time passes", { timeout: 15_000 }, async () => {
    const { room, member } = await classroom();
    const api = roomApi(room.id);
    const a = await member("A");
    const b = await member("B");
    const client = await connect(a.browser, room.id);
    await questionFrom(await api.ask(a.browser, "in time"));
    await client.received("in time");

    await scheduler.wait(3_500);

    // A hidden event leaves even an expired socket untouched: no frame and no close.
    const hidden = await connect(a.browser, room.id);
    await questionFrom(await api.ask(b.browser, "private of B", "private"));
    await hidden.received('"snapshot"');
    expect(client.closes).toEqual([]);

    const fresh = await connect(a.browser, room.id);
    await questionFrom(await api.ask(a.browser, "too late"));
    await fresh.received("too late");
    await vi.waitFor(() => expect(client.closes).toEqual([4001]));
    expect(client.frames.join()).not.toContain("too late");
    fresh.socket.close(1000);
    hidden.socket.close(1000);
  });

  it("expires a reset token after real time passes", { timeout: 15_000 }, async () => {
    const email = uniqueEmail("reset");
    await new Browser().signUp(email);

    // The reset route belongs to M4. This only proves the lifetime reaches the library.
    let token = "";
    const options = authOptions(env);
    const auth = betterAuth({
      ...options,
      emailAndPassword: {
        ...options.emailAndPassword,
        sendResetPassword: async (data) => {
          token = data.token;
        },
      },
    });
    const issue = async () => {
      await auth.api.requestPasswordReset({ body: { email } });
      return token;
    };
    const redeem = (value: string) =>
      auth.api.resetPassword({ body: { token: value, newPassword: `${PASSWORD}-new` } });

    await expect(redeem(await issue())).resolves.toMatchObject({ status: true });

    const stale = await issue();
    await scheduler.wait(3_500);
    await expect(redeem(stale)).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });
});
