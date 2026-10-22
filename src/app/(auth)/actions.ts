"use server";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { tooManyAttempts } from "@/lib/rate-limit";
import { emailResetAvailable, otpEmail, sendMail } from "@/lib/mail";
import { generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, OTP_TTL_MINUTES, otpMatches } from "@/lib/otp";
import { createSession, destroySession } from "@/lib/session";

export interface FormState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "name" | "confirm" | "code", string>>;
  email?: string;
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

const clientIp = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({ name: String(form.get("name") ?? ""), email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { email: String(form.get("email") ?? ""), fieldErrors: { email: f.email?.[0], password: f.password?.[0], name: f.name?.[0] } };
  }
  const { name, email: addr, password } = parsed.data;

  try {
    const user = await db.user.create({ data: { email: addr, name, passwordHash: await hashPassword(password) } });
    await createSession(user.id);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { email: addr, fieldErrors: { email: "An account with this email already exists" } };
    }
    console.error("signup failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, error: "We couldn't create your account. Check that the database is reachable and try again." };
  }
  redirect("/");
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

// ───────────── Forgot password: one-time code sent by email ─────────────

/**
 * Step 1: email a 6-digit code. The response is ALWAYS "code sent" (when email is set up), whether or not the
 * account exists, so the form cannot be used to discover registered emails. Codes last 10 minutes, work once,
 * and a new request replaces the old code (with a 60-second cooldown against email flooding).
 */
export async function requestResetOtpAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(String(form.get("email") ?? ""));
  if (!parsed.success) return { email: String(form.get("email") ?? ""), fieldErrors: { email: "Enter a valid email address" } };
  const addr = parsed.data;
  if (!emailResetAvailable()) return { email: addr, error: "Email is not set up on this server yet, so codes cannot be sent. Please contact the site owner." };

  const ip = await clientIp();
  if (tooManyAttempts(`otp:send:email:${addr}`, 5, 15 * 60_000) || tooManyAttempts(`otp:send:ip:${ip}`, 15, 15 * 60_000)) {
    return { email: addr, error: "Too many requests. Please wait 15 minutes and try again." };
  }

  try {
    const user = await db.user.findUnique({ where: { email: addr }, select: { id: true, name: true } });
    if (user) {
      const last = await db.passwordResetOtp.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const coolingDown = last && Date.now() - last.createdAt.getTime() < OTP_RESEND_SECONDS * 1000;
      if (!coolingDown) {
        const code = generateOtp();
        await db.$transaction([
          db.passwordResetOtp.deleteMany({ where: { userId: user.id } }), // only the newest code is valid
          db.passwordResetOtp.create({ data: { userId: user.id, codeHash: hashOtp(code, user.id), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) } }),
        ]);
        await sendMail({ to: addr, ...otpEmail(user.name, code, OTP_TTL_MINUTES) });
      }
    }
  } catch (e) {
    console.error("send otp failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, error: "We couldn't send the code right now. Please try again." };
  }
  return { email: addr, done: true };
}

const resetSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  confirm: z.string(),
});

const BAD_CODE = "That code is wrong or has expired. Check the latest email, or request a new code.";

/** Step 2: verify the code and set the new password. Wrong guesses burn the code after 5 tries. */
export async function resetWithOtpAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ email: String(form.get("email") ?? ""), code: String(form.get("code") ?? ""), password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { email: String(form.get("email") ?? ""), done: true, fieldErrors: { code: f.code?.[0], password: f.password?.[0] } };
  }
  const { email: addr, code, password, confirm } = parsed.data;
  if (password !== confirm) return { email: addr, done: true, fieldErrors: { confirm: "Passwords do not match" } };

  const ip = await clientIp();
  if (tooManyAttempts(`otp:verify:email:${addr}`, 10, 15 * 60_000) || tooManyAttempts(`otp:verify:ip:${ip}`, 30, 15 * 60_000)) {
    return { email: addr, done: true, error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  try {
    const user = await db.user.findUnique({ where: { email: addr }, select: { id: true } });
    const newHash = await hashPassword(password); // same work whether or not the email exists
    const otp = user ? await db.passwordResetOtp.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } }) : null;
    if (!user || !otp || otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) return { email: addr, done: true, error: BAD_CODE };

    if (!otpMatches(code, user.id, otp.codeHash)) {
      await db.passwordResetOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return { email: addr, done: true, error: BAD_CODE };
    }
    // Consume atomically so one code cannot be used twice, even by two simultaneous requests.
    const claimed = await db.passwordResetOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return { email: addr, done: true, error: BAD_CODE };
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
      db.session.deleteMany({ where: { userId: user.id } }), // sign out everywhere
      db.passwordResetOtp.deleteMany({ where: { userId: user.id } }),
    ]);
  } catch (e) {
    console.error("otp reset failed", e instanceof Error ? e.message : "unknown");
    return { email: addr, done: true, error: "We couldn't reset your password right now. Please try again." };
  }
  redirect("/login?reset=1");
}
