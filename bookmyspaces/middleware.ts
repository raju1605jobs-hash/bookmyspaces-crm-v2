// src/middleware.ts
//
// CRITICAL: /api routes must be excluded from auth middleware.
// Meta's verification GET request has no cookies/session — if your middleware
// enforces authentication, it will redirect Meta to /login, causing 302/403.

import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Always pass through API routes ────────────────────────────────────────
  // Reason: external services (Meta, Stripe, etc.) hit these without session cookies.
  if (pathname.startsWith("/api/")) {
    console.log("[Middleware] Passing through API route:", pathname);
    return NextResponse.next();
  }

  // ── Your existing auth logic below this line ───────────────────────────────
  // Example — replace with your actual auth implementation:
  //
  // const token = request.cookies.get("auth-token")?.value;
  // if (!token && !pathname.startsWith("/login")) {
  //   return NextResponse.redirect(new URL("/login", request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - /api/*         (webhook endpoints, no auth needed)
     * - /_next/static  (static files)
     * - /_next/image   (image optimization)
     * - /favicon.ico
     *
     * The negative lookahead (?!api|_next...) is the key part.
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
