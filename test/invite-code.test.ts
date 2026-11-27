import { describe, expect, it } from "vitest";
import { ALPHABET, generateInviteCode, normalizeInviteCode } from "../src/worker/invite-code.ts";

describe("invite codes (spec 7.5)", () => {
  it("uses Crockford base32 without I, L, O and U", () => {
    expect(ALPHABET).toHaveLength(32);
    for (const letter of "ILOU") expect(ALPHABET).not.toContain(letter);
  });

  it("generates 10 characters spread over the whole alphabet", () => {
    const codes = Array.from({ length: 500 }, generateInviteCode);
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    const counts = new Map<string, number>();
    for (const ch of codes.join("")) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    // 5,000 characters, about 156 per letter if uniform: every letter appears, none dominates.
    expect(counts.size).toBe(32);
    expect(Math.max(...counts.values())).toBeLessThan(260);
    expect(new Set(codes).size).toBe(500);
  });

  it.each([
    ["abcd-efgh-jk", "ABCDEFGHJK"],
    [" 0123 4567 89 ", "0123456789"],
    ["oOiIlL0123", "0011110123"],
    ["\tABCDEFGHJK\n", "ABCDEFGHJK"],
  ])("reads %j as %s", (typed, code) => {
    expect(normalizeInviteCode(typed)).toBe(code);
  });

  it.each(["ABCDEFGHJ", "ABCDEFGHJKM", "ABCDEFGHJU", "ABCDE_FGHJ", "ABCDEFGHJ!", "", "ÄBCDEFGHJK"])(
    "refuses %j",
    (typed) => {
      expect(normalizeInviteCode(typed)).toBeNull();
    },
  );
});
