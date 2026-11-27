import { describe, expect, it } from "vitest";
import { cleanupSql, cookieProblems, percentile } from "../../scripts/lib/check.mjs";

describe("production check helpers", () => {
  const secure = "__Secure-better-auth.session_token=v; Path=/; HttpOnly; Secure; SameSite=Lax";
  it("accepts a secure session cookie and names what is missing", () => {
    expect(cookieProblems([secure])).toEqual([]);
    expect(cookieProblems(["better-auth.session_token=v; Path=/"])).toHaveLength(4);
    expect(cookieProblems([secure.replace(" Secure;", "")])).toEqual(["no Secure"]);
    expect(cookieProblems([])).toEqual(["no session cookie was set"]);
  });
  it("takes the nearest-rank percentile", () => {
    const values = Array.from({ length: 30 }, (_, i) => 30 - i);
    expect(percentile(values, 99)).toBe(30);
    expect(percentile(values, 50)).toBe(15);
  });
  it("only ever writes SQL for test accounts", () => {
    const mine = "prodcheck-abc1-a@handsup-prodcheck.invalid";
    expect(cleanupSql([mine]).remove).toContain(`'${mine}'`);
    for (const other of ["someone@example.com", "x' or '1'='1", `${mine}.example.com`]) {
      expect(() => cleanupSql([mine, other])).toThrow(/not test accounts/);
    }
    expect(() => cleanupSql([])).toThrow();
  });
});
