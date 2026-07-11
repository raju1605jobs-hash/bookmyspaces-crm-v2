// src/middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// ISS-001 (audit/MASTER_ISSUE_REGISTER.csv): real session enforcement.
// Previously this function unconditionally returned NextResponse.next() for
// every request ("TEMP: allow everything while stabilizing app").
//
// Scope: this middleware only gates PAGE navigation. API routes continue to
// pass through here unchanged and are instead individually protected via
// requireAuth()/requireRole() (src/lib/auth-guard.ts) per ISS-002 — this
// matches TEST_PLAN.md's two separate scenarios ("logged-out page sweep"
// expects a redirect; "logged-out API sweep" expects a 401 JSON body, not a
// redirect, which is why API routes are not gated here).
//
// Public pages (no session required): the landing page, the auth flow itself,
// and the proposal share-token page (customers reach this via a link with no
// login — same intentionally-public design as the RLS "public share-token
// read" policy already on `proposals`, see LIVE_SCHEMA_AUDIT.md).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareAuthClient } from '@/lib/supabase-middleware'

const PUBLIC_PAGE_PREFIXES = [
  '/auth',            // /auth/login, /auth/callback, /auth/auth-code-error
  '/proposals/share',  // public, share-token-gated proposal view
]

function isPublicPage(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // API routes, Next.js internals, and static files are never gated here.
  // API auth is enforced per-route (ISS-002); static/internal requests have
  // no concept of a "session" to check.
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next()
  }

  // Every other page requires a valid Supabase session.
  const response = NextResponse.next()
  const supabase = createMiddlewareAuthClient(request, response)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
