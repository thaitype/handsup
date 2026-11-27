import { isProduction } from "better-auth";
import { expect, it } from "vitest";
import { describeSpecOptions } from "./support/auth-spec.ts";

it("runs with Better Auth outside production", () => {
  expect(isProduction).toBe(false);
});

describeSpecOptions();
