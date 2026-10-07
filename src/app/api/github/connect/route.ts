import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/github";
import { githubConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts the GitHub App user authorization flow. Requires a logged-in user. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!githubConfigured()) return NextResponse.redirect(new URL("/projects/new?error=not-configured", req.url));

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("cm_gh_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/github", maxAge: 600 });
  return res;
}
