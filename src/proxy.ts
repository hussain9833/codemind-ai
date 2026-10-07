import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: redirects visitors with NO session cookie to /login.
 * It does not validate the session. Real authentication/authorization is enforced
 * server-side in layouts, pages, actions and route handlers (requireUser / requireProject).
 */
const PUBLIC = ["/login", "/signup"];
/** Brand assets and metadata files must be reachable without a session (crawlers, link previews, browser tabs). */
const PUBLIC_ASSETS = ["/icon.svg", "/apple-icon", "/opengraph-image", "/twitter-image", "/manifest.webmanifest", "/favicon.ico"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasCookie = req.cookies.has("cm_session");
  const isPublic = PUBLIC.some((p) => pathname === p) || PUBLIC_ASSETS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasCookie && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
