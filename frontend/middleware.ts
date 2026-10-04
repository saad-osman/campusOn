import { NextRequest, NextResponse } from "next/server";
import { HINT_COOKIE, HINT_MAX_AGE } from "@/lib/session-hint";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/onboarding",
  "/files",
  "/discover",
  "/compare",
  "/opportunities",
  "/professors",
  "/faculty",
  "/admin",
];

const SESSION_COOKIE = "sr_session";
// Mirrored into HINT_COOKIE (lib/session-hint.ts) so the nav and home CTAs can show the right set
// while the API is still waking up. Display only.

function syncHint(request: NextRequest, response: NextResponse) {
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const hinted = request.cookies.get(HINT_COOKIE)?.value === "1";
  if (signedIn && !hinted) {
    response.cookies.set(HINT_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: HINT_MAX_AGE,
    });
  } else if (!signedIn && request.cookies.has(HINT_COOKIE)) {
    // Expire it on path "/" explicitly (a bare delete would default to the request's path).
    response.cookies.set(HINT_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return syncHint(request, NextResponse.next());

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return syncHint(request, NextResponse.redirect(loginUrl));
  }
  return syncHint(request, NextResponse.next());
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/register",
    "/dashboard/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/files/:path*",
    "/discover/:path*",
    "/compare/:path*",
    "/opportunities/:path*",
    "/professors/:path*",
    "/faculty/:path*",
    "/admin/:path*",
  ],
};
