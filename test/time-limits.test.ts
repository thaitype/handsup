import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/worker/auth.ts";
import { resetLinkTtlSeconds, socketMaxLifetimeSeconds } from "../src/worker/config.ts";
import { classroom, questionFrom, roomApi } from "./support/classroom.ts";
import { connect } from "./support/socket.ts";

describe("time limits when unset", () => {
  it("uses the production values", async () => {
    const context = await createAuth(env).$context;
    expect(context.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(86_400);
    expect(socketMaxLifetimeSeconds(env)).toBe(900);
  });

  it("keeps a socket valid past the short test lifetime", { timeout: 15_000 }, async () => {
    const { room, member } = await classroom();
    const a = await member("A");
    const client = await connect(a.browser, room.id);
    await scheduler.wait(3_500);
    await questionFrom(await roomApi(room.id).ask(a.browser, "still here"));
    await client.received("still here");
    expect(client.closes).toEqual([]);
    client.socket.close(1000);
  });
});

describe("time limit parsing", () => {
  const withVars = (vars: Partial<Env>) => ({ ...env, ...vars }) as Env;

  it.each(["0", "901", "1.5", "-1", "", "10s"])("rejects socket lifetime %j", (value) => {
    expect(() => socketMaxLifetimeSeconds(withVars({ SOCKET_MAX_LIFETIME_SECONDS: value }))).toThrow(
      "SOCKET_MAX_LIFETIME_SECONDS",
    );
  });

  it.each(["1", "900"])("accepts socket lifetime %j", (value) => {
    expect(socketMaxLifetimeSeconds(withVars({ SOCKET_MAX_LIFETIME_SECONDS: value }))).toBe(
      Number(value),
    );
  });

  it("rejects a zero reset lifetime and accepts a positive one", () => {
    expect(() => resetLinkTtlSeconds(withVars({ RESET_LINK_TTL_SECONDS: "0" }))).toThrow(
      "RESET_LINK_TTL_SECONDS",
    );
    expect(resetLinkTtlSeconds(withVars({ RESET_LINK_TTL_SECONDS: "5" }))).toBe(5);
  });
});
