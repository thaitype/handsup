/**
 * Spec 7.1: stored password hashes name their scheme and parameters, so a later scheme can
 * be added while old accounts still verify. The hashing itself is Better Auth's own
 * `@better-auth/utils/password`, unchanged: on workerd its export condition selects native
 * `node:crypto` scrypt with N=16384, r=16, p=1 (checked by `pnpm check:bundle`).
 */
import { hashPassword as scryptHash, verifyPassword as scryptVerify } from "@better-auth/utils/password";

/** Describes what `@better-auth/utils/password` does. It is a label, not a setting. */
export const SCRYPT_PREFIX = "scrypt-n16384-r16-p1$";

export async function hashPassword(password: string): Promise<string> {
  return SCRYPT_PREFIX + (await scryptHash(password));
}

/** A stored hash with any other prefix, or none, is refused rather than guessed at. */
export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  if (!hash.startsWith(SCRYPT_PREFIX)) throw new Error("Unknown password hash scheme");
  return scryptVerify(hash.slice(SCRYPT_PREFIX.length), password);
}
