import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Policy for password-reset one-time codes. */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;

/** 6 random digits from the OS CSPRNG. */
export const generateOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Keyed hash bound to the user, so a stolen hash cannot be replayed against another account. */
export function hashOtp(code: string, userId: string): string {
  return createHmac("sha256", Buffer.from(env().ENCRYPTION_KEY, "base64")).update(`${userId}:${code}`).digest("hex");
}

export function otpMatches(code: string, userId: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(code, userId), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
