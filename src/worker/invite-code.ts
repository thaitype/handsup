/**
 * Spec 7.5: invite codes are 10 characters of Crockford base32 (0-9 A-Z without I L O U),
 * about 50 bits from crypto.getRandomValues.
 */
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 10;

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256 is a multiple of 32, so taking the low five bits is unbiased.
  return Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("");
}

const VALID = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * What a person typed, read the way Crockford base32 reads it: any case, spaces and hyphens
 * ignored, O as 0, I and L as 1. Anything that is not then a well-formed code gives null.
 */
export function normalizeInviteCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return VALID.test(code) ? code : null;
}
