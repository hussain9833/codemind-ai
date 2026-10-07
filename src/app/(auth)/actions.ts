"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";

export interface FormState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "name", string>>;
  email?: string;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

const signupSchema = z.object({
  name: z.string().trim().max(80).optional(),
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
    name: form.get("name") || undefined,
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { email: String(form.get("email") ?? ""), fieldErrors: { email: f.email?.[0], password: f.password?.[0], name: f.name?.[0] } };
  }
  const { name, email: addr, password } = parsed.data;

  try {
    const user = await db.user.create({ data: { email: addr, name: name || null, passwordHash: await hashPassword(password) } });
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
