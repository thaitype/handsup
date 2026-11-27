import { verifyPassword as libraryVerify } from "@better-auth/utils/password";
import { env } from "cloudflare:workers";
import { scrypt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, SCRYPT_PREFIX, verifyPassword } from "../src/worker/password.ts";
import { Browser, PASSWORD, uniqueEmail } from "./support/http.ts";

const STORED = /^scrypt-n16384-r16-p1\$([0-9a-f]{32}):([0-9a-f]{128})$/;

const storedHash = async (email: string) =>
  (
    await env.DB.prepare(
      'select a.password from account a join "user" u on u.id = a.userId where u.email = ?',
    )
      .bind(email)
      .first<{ password: string }>()
  )?.password;

const setStoredHash = (email: string, hash: string) =>
  env.DB.prepare(
    'update account set password = ? where userId = (select id from "user" where email = ?)',
  )
    .bind(hash, email)
    .run();

/** Our own scrypt call with the parameters the prefix names, independent of the library. */
const scryptHex = (password: string, salt: string) =>
  new Promise<string>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key.toString("hex")),
    ),
  );

describe("prefixed password hash (spec 7.1)", () => {
  it("stores the scheme and parameters in front of a salted scrypt hash", async () => {
    const email = uniqueEmail("prefix");
    expect((await new Browser().signUp(email)).status).toBe(200);
    expect(await storedHash(email)).toMatch(STORED);
  });

  it("names the parameters the hash was really made with", async () => {
    const [, salt = "", key = ""] = STORED.exec(await hashPassword(PASSWORD)) ?? [];
    expect(await scryptHex(PASSWORD, salt)).toBe(key);
    // Control: other parameters give another key, so the comparison can fail.
    const other = await new Promise<string>((resolve, reject) =>
      scrypt(PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k.toString("hex")))),
    );
    expect(other).not.toBe(key);
  });

  it("keeps the library's own format after the prefix", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored.startsWith(SCRYPT_PREFIX)).toBe(true);
    expect(await libraryVerify(stored.slice(SCRYPT_PREFIX.length), PASSWORD)).toBe(true);
  });

  it("verifies the right password and refuses a wrong one", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword({ hash, password: PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash, password: "not-the-password" })).toBe(false);
  });

  it.each([
    ["no prefix (the library default format)", ""],
    ["other parameters", "scrypt-n16384-r8-p1$"],
    ["another scheme", "pbkdf2-sha256-i100000$"],
  ])("refuses a stored hash with %s", async (_, prefix) => {
    const email = uniqueEmail("scheme");
    expect((await new Browser().signUp(email)).status).toBe(200);
    const stored = (await storedHash(email)) ?? "";
    const bare = stored.slice(SCRYPT_PREFIX.length);

    // Control: the account signs in with its stored hash as written.
    expect((await new Browser().signIn(email)).status).toBe(200);

    await setStoredHash(email, prefix + bare);
    await expect(verifyPassword({ hash: prefix + bare, password: PASSWORD })).rejects.toThrow(
      "Unknown password hash scheme",
    );
    const refused = new Browser();
    // 500, not the 401 of a wrong password: an unknown scheme is a fault, not a bad guess.
    expect((await refused.signIn(email)).status).toBe(500);
    expect((await refused.me()).status).toBe(401);

    // Putting the prefix back restores sign-in, so the refusal came from the prefix alone.
    await setStoredHash(email, stored);
    expect((await new Browser().signIn(email)).status).toBe(200);
  });
});
