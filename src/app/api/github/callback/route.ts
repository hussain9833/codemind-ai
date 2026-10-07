import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { connectGithubAccount } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GitHub redirects here for two cases:
 *  1. OAuth authorization: ?code&state  -> link the GitHub account to the logged-in user.
 *  2. App installation (Setup URL):  ?installation_id&setup_action -> continue project creation.
 * Both require a logged-in CodeMind user; neither trusts the browser for identity.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const q = req.nextUrl.searchParams;
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url));
    res.cookies.delete({ name: "cm_gh_state", path: "/api/github" });
    return res;
  };

  const code = q.get("code");
  if (code) {
    const state = q.get("state") ?? "";
    const expected = req.cookies.get("cm_gh_state")?.value ?? "";
    if (!expected || !safeEq(state, expected)) return to("/projects/new?error=state");
    try {
      await connectGithubAccount(user.id, code);
    } catch (e) {
      console.error("github connect failed", e instanceof Error ? e.message : "unknown");
      return to("/projects/new?error=connect");
    }
    return to("/projects/new");
  }

  // Installation return. The id is only a hint; access is re-verified server-side per request.
  const installation = q.get("installation_id");
  return to(installation && /^\d+$/.test(installation) ? `/projects/new?installation=${installation}` : "/projects/new");
}
