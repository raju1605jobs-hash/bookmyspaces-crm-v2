// src/middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Next.js 14 App Router middleware.
// Runs on every matched request BEFORE the page/route handler.
//
// Responsibilities:
//   1. Refresh the Supabase session (keeps cookies fresh)
//   2. Redirect unauthenticated users to /auth/login for protected routes
//   3. Allow all public routes through without any auth check
//
// PUBLIC routes (no auth needed):
//   /auth/*                 login, logout, callback
//   /proposals/share/*      customer-facing proposal share links
//   /api/whatsapp/webhook   Meta webhook (verified by token, not user session)
//   /api/proposal/share/*   proposal share API
//   /api/health             uptime check
//   /                       landing page
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareAuthClient } from '@/lib/supabase-middleware'

// Routes that never require authentication
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/logout',
  '/auth/callback',
  '/auth/reset-password',
  '/proposals/share/',      // prefix match — customer proposal viewer
  '/api/whatsapp/webhook',  // Meta Cloud API webhook
  '/api/proposal/share/',   // prefix match
  '/api/health',
  '/',                      // root landing
]

function isPublicPath(pathname: string): boolean {
  // Exact public routes
  const exactPaths = [
    '/',
    '/auth/login',
    '/auth/logout',
    '/auth/callback',
    '/auth/reset-password',
    '/api/whatsapp/webhook',
    '/api/health',
  ]

  // Prefix-based public routes
  const prefixPaths = [
    '/proposals/share/',
    '/api/proposal/share/',
  ]

  if (exactPaths.includes(pathname)) {
    return true
  }

  return prefixPaths.some((p) => pathname.startsWith(p))
}

  // Always allow public paths through without touching session
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Create a response to pass through — middleware client will set cookies on it
  const response = NextResponse.next({ request: { headers: request.headers } })

  try {
    const supabase = createMiddlewareAuthClient(request, response)

    // Refresh session — this is required by @supabase/ssr to keep tokens fresh.
    // getSession() is safe here because we only need to check existence.
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      // Not authenticated — redirect to login, preserving intended destination
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Authenticated — allow through with refreshed session cookies
    return response

  } catch {
    // On any auth error, redirect to login rather than crash
    const loginUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - public folder files
     */
'/((?!_next/static|_next/image|favicon.ico|api/whatsapp/|api/health|api/proposal/share|proposals/share/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
}
