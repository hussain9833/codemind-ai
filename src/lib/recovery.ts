import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * One-time account recovery codes (replaces email / OTP resets).
 *
 * - 20 characters of Crockford base32 = 100 bits of entropy: not guessable, so a fast keyed hash is safe.
 * - Only an HMAC-SHA256 (keyed with the server's ENCRYPTION_KEY) is stored; the code is shown to the user once.
 * - A code is single-use: every successful reset replaces it with a new one.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U
const LENGTH = 20;

export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return raw.match(/.{5}/g)!.join("-");
}

/** Accepts the code however the user typed it (case, dashes, spaces, look-alike characters). */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

export const isWellFormedRecoveryCode = (input: string) => new RegExp(`^[${ALPHABET}]{${LENGTH}}$`).test(normalizeRecoveryCode(input));

export function hashRecoveryCode(input: string): string {
  return createHmac("sha256", Buffer.from(env().ENCRYPTION_KEY, "base64")).update(normalizeRecoveryCode(input)).digest("hex");
}

export function recoveryCodeMatches(input: string, storedHash: string | null | undefined): boolean {
  // Compare against a dummy when there is no stored hash so timing is the same either way.
  const stored = Buffer.from(storedHash ?? "0".repeat(64), "hex");
  const given = Buffer.from(hashRecoveryCode(input), "hex");
  const equal = stored.length === given.length && timingSafeEqual(stored, given);
  return equal && !!storedHash;
}
