import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { newToken, sha256 } from "./crypto";
import { db } from "./db";

export const SESSION_COOKIE = "cm_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const ua = (await headers()).get("user-agent")?.slice(0, 255) ?? null;
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt, userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Current user from the session cookie, or null. Memoized per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;

  // Sliding expiry. Cookies can only be written in actions/route handlers, so failure here is fine.
  if (session.expiresAt.getTime() - Date.now() < TTL_MS - RENEW_WINDOW_MS) {
    const expiresAt = new Date(Date.now() + TTL_MS);
    await db.session.update({ where: { id: session.id }, data: { expiresAt } });
    try { (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt)); } catch {}
  }
  return session.user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Server-side gate. Use in layouts, pages, actions and route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
