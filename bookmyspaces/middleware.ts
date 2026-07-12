// ⚠️ DEAD FILE — NOT USED BY NEXT.JS. DO NOT EDIT THIS TO "FIX" AUTH. ⚠️
// ISS-026 (audit/MASTER_ISSUE_REGISTER.csv): this project uses the `src/`
// directory convention, so Next.js resolves middleware from
// `src/middleware.ts` ONLY. Confirmed via .next/server/middleware-manifest.json
// after a build: "name": "src/middleware" — this root-level file is compiled
// nowhere and never runs. It is an early placeholder stub (auth logic was
// literally commented out as an "Example") left behind after the real
// middleware was written directly into src/middleware.ts.
//
// The live, ISS-001-fixed middleware with real Supabase session enforcement
// is at src/middleware.ts. Edit that file, not this one.
//
// Kept in place only because this sandbox cannot delete files (permission
// denied on this mount, same as ISS-013/021/022) — flagged for the user to
// `rm middleware.ts` from the project root directly on their own machine.
// Original placeholder content below, unmodified except for this header.
// ─────────────────────────────────────────────────────────────────────────

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
