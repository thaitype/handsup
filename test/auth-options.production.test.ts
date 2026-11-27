import { isProduction } from "better-auth";
import { expect, it } from "vitest";
import { describeSpecOptions } from "./support/auth-spec.ts";

it("runs with Better Auth in production mode", () => {
  expect(isProduction).toBe(true);
});

describeSpecOptions();
