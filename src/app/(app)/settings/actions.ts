"use server";

import { verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { tooManyAttempts } from "@/lib/rate-limit";
import { generateRecoveryCode, hashRecoveryCode } from "@/lib/recovery";
import { requireUser } from "@/lib/session";

export interface RecoveryState { error?: string; recoveryCode?: string; at?: string }

/**
 * Creates (or replaces) the signed-in user's recovery code. The current password is required,
 * so someone using an unlocked browser cannot silently mint a code for the account.
 */
export async function regenerateRecoveryCodeAction(_: RecoveryState, form: FormData): Promise<RecoveryState> {
  const user = await requireUser();
  if (tooManyAttempts(`recovery:${user.id}`, 5, 15 * 60_000)) return { error: "Too many attempts. Please wait 15 minutes." };

  const password = String(form.get("password") ?? "");
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!password || !row || !(await verifyPassword(password, row.passwordHash))) return { error: "Incorrect password." };

  const code = generateRecoveryCode();
  const at = new Date();
  await db.user.update({ where: { id: user.id }, data: { recoveryCodeHash: hashRecoveryCode(code), recoveryCodeAt: at } });
  return { recoveryCode: code, at: at.toISOString() };
}
