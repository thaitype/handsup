import { isProduction, isTest } from "better-auth";
import { expect, it } from "vitest";
import { describeSpecOptions } from "./support/auth-spec.ts";

it("runs with Better Auth in test mode, where its defaults are weakest", () => {
  expect(isTest()).toBe(true);
  expect(isProduction).toBe(false);
});

describeSpecOptions();
