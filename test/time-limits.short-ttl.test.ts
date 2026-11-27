import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { authOptions } from "../src/worker/auth.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";
import { connect } from "./support/socket.ts";

describe("time limits set to seconds", () => {
  it("expires a socket after real time passes", { timeout: 15_000 }, async () => {
    const stub = env.ROOM.get(env.ROOM.idFromName(crypto.randomUUID()));
    const client = await connect(stub);
    expect(await stub.broadcast("in time")).toBe(1);
    await vi.waitFor(() => expect(client.messages).toEqual(["in time"]));

    await scheduler.wait(3_500);

    const fresh = await connect(stub);
    expect(await stub.broadcast("too late")).toBe(1);
    await vi.waitFor(() => expect(fresh.messages).toEqual(["too late"]));
    await vi.waitFor(() => expect(client.closes).toEqual([4001]));
    expect(client.messages).toEqual(["in time"]);
    fresh.socket.close(1000);
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
