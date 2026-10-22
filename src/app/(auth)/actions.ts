"use server";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { tooManyAttempts } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { emailResetAvailable, resetEmail, sendMail } from "@/lib/mail";
import { generateRecoveryCode, hashRecoveryCode, isWellFormedRecoveryCode, recoveryCodeMatches } from "@/lib/recovery";
import { createResetToken, peekResetToken, RESET_TTL_MINUTES } from "@/lib/reset-token";
import { createSession, destroySession } from "@/lib/session";

export interface FormState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "name" | "confirm" | "code", string>>;
  email?: string;
  /** Shown to the user exactly once (signup / after a reset). Never stored in plain text. */
  recoveryCode?: string;
  done?: boolean;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email,
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    name: String(form.get("name") ?? ""),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { email: String(form.get("email") ?? ""), fieldErrors: { email: f.email?.[0], password: f.password?.[0], name: f.name?.[0] } };
  }
  const { name, email: addr, password } = parsed.data;

  try {
    const recoveryCode = generateRecoveryCode();
    const user = await db.user.create({ data: { email: addr, name, passwordHash: await hashPassword(password), recoveryCodeHash: hashRecoveryCode(recoveryCode), recoveryCodeAt: new Date() } });
    await createSession(user.id);
    // Show the code once, then continue (the session cookie is already set).
    return { email: addr, recoveryCode, done: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { email: addr, fieldErrors: { email: "An account with this email already exists" } };
    }
    console.error("signup failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, error: "We couldn't create your account. Check that the database is reachable and try again." };
  }
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const addr = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!addr || !password) return { email: addr, error: "Enter your email and password." };

  let ok = false;
  try {
    const user = await db.user.findUnique({ where: { email: addr } });
    // Always run a hash comparison so timing doesn't reveal whether the email exists.
    ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
    if (user && ok) await createSession(user.id);
    else ok = false;
  } catch (e) {
    console.error("login failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, error: "We couldn't sign you in right now. Check that the database is reachable and try again." };
  }
  if (!ok) return { email: addr, error: "Incorrect email or password." };
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ───────────── Forgot password: email + one-time recovery code (no OTP, no email delivery) ─────────────

const resetSchema = z.object({
  email,
  code: z.string().trim().min(1, "Enter your recovery code").max(60),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  confirm: z.string(),
});

const VERIFY_FAILED = "That email and recovery code don't match. Check them and try again.";

/**
 * Resets a password with the account email plus its one-time recovery code.
 * Security: generic failure message (no account enumeration), constant-time comparison, strict rate
 * limits per email and per IP, every session revoked, and the used code is replaced by a new one.
 * Accounts that never created a recovery code cannot use this flow (they sign in and create one in Settings).
 */
export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const raw = { email: String(form.get("email") ?? ""), code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") };
  const parsed = resetSchema.safeParse(raw);
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { email: raw.email, fieldErrors: { email: f.email?.[0], code: f.code?.[0], password: f.password?.[0] } };
  }
  const { email: addr, code, password, confirm } = parsed.data;
  if (password !== confirm) return { email: addr, fieldErrors: { confirm: "Passwords do not match" } };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooManyAttempts(`reset:email:${addr}`, 5, 15 * 60_000) || tooManyAttempts(`reset:ip:${ip}`, 20, 15 * 60_000)) {
    return { email: addr, error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  try {
    const user = await db.user.findUnique({ where: { email: addr }, select: { id: true, recoveryCodeHash: true } });
    const newHash = await hashPassword(password); // same work whether or not the email exists
    const wellFormed = isWellFormedRecoveryCode(code);
    const ok = recoveryCodeMatches(code, user?.recoveryCodeHash) && wellFormed;
    if (!user || !ok) return { email: addr, error: VERIFY_FAILED };

    const next = generateRecoveryCode(); // the used code is now dead; hand out a fresh one
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: newHash, recoveryCodeHash: hashRecoveryCode(next), recoveryCodeAt: new Date() } }),
      db.session.deleteMany({ where: { userId: user.id } }), // sign out everywhere
    ]);
    return { email: addr, done: true, recoveryCode: next };
  } catch (e) {
    console.error("password reset failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, error: "We couldn't reset your password right now. Please try again." };
  }
}

// ───────────── Forgot password: emailed single-use link ─────────────

const clientIp = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/**
 * Sends a reset link if the account exists. The response is ALWAYS the same
 * ("if an account exists, we sent a link") so the form cannot be used to discover registered emails.
 */
export async function requestResetLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(String(form.get("email") ?? ""));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address" }, email: String(form.get("email") ?? "") };
  const addr = parsed.data;
  if (!emailResetAvailable()) return { email: addr, error: "Email reset is not set up on this server. Use your recovery code instead." };

  const ip = await clientIp();
  if (tooManyAttempts(`link:email:${addr}`, 3, 15 * 60_000) || tooManyAttempts(`link:ip:${ip}`, 10, 15 * 60_000)) {
    return { email: addr, error: "Too many requests. Please wait 15 minutes and try again." };
  }

  try {
    const user = await db.user.findUnique({ where: { email: addr }, select: { id: true, name: true } });
    if (user) {
      const token = await createResetToken(user.id);
      const link = `${env().APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
      const mail = resetEmail(user.name, link, RESET_TTL_MINUTES);
      await sendMail({ to: addr, ...mail });
    }
  } catch (e) {
    console.error("reset link failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, error: "We couldn't send the email right now. Please try again." };
  }
  return { email: addr, done: true };
}

const tokenResetSchema = z.object({ token: z.string().min(20).max(100), password: z.string().min(10, "Use at least 10 characters").max(200), confirm: z.string() });

/** Sets a new password from an emailed link. The token works once and expires after 30 minutes. */
export async function resetWithTokenAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = tokenResetSchema.safeParse({ token: String(form.get("token") ?? ""), password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") });
  if (!parsed.success) return { fieldErrors: { password: parsed.error.flatten().fieldErrors.password?.[0] }, error: parsed.error.flatten().fieldErrors.token ? "This reset link is not valid." : undefined };
  const { token, password, confirm } = parsed.data;
  if (password !== confirm) return { fieldErrors: { confirm: "Passwords do not match" } };
  if (tooManyAttempts(`token:ip:${await clientIp()}`, 20, 15 * 60_000)) return { error: "Too many attempts. Please wait 15 minutes." };

  try {
    const row = await peekResetToken(token);
    if (!row) return { error: "This reset link is invalid, expired or already used. Request a new one." };
    const newHash = await hashPassword(password);
    // Consume atomically: only one request can flip usedAt from null.
    const claimed = await db.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return { error: "This reset link was already used. Request a new one." };
    await db.$transaction([
      db.user.update({ where: { id: row.userId }, data: { passwordHash: newHash } }),
      db.session.deleteMany({ where: { userId: row.userId } }), // sign out everywhere
      db.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
    ]);
  } catch (e) {
    console.error("token reset failed", e instanceof Error ? e.message : "unknown");
    return { error: "We couldn't reset your password right now. Please try again." };
  }
  redirect("/login?reset=1");
}
