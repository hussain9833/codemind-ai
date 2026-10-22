import "server-only";
import { randomBytes } from "node:crypto";
import { sha256 } from "./crypto";
import { db } from "./db";

export const RESET_TTL_MINUTES = 30;

/** Creates a fresh single-use token (invalidating earlier unused ones). Returns the plain token for the email link. */
export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) } }),
  ]);
  return token;
}

/** Looks a token up without consuming it. */
export async function peekResetToken(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}
