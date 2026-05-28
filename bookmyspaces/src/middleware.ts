```ts
// src/middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Next.js 14 App Router middleware.
// Handles:
//   • Supabase session refresh
//   • Protected route auth
//   • Public route bypass
//   • WhatsApp webhook bypass
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareAuthClient } from '@/lib/supabase-middleware'

// Public routes that should bypass auth
const EXACT_PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/logout',
  '/auth/callback',
  '/auth/reset-password',
  '/api/whatsapp/webhook',
  '/api/health',
]

const PREFIX_PUBLIC_PATHS = [
  '/proposals/share/',
  '/api/proposal/share/',
]

function isPublicPath(pathname: string): boolean {
  // Exact matches
  if (EXACT_PUBLIC_PATHS.includes(pathname)) {
    return true
  }

  // Prefix matches
  return PREFIX_PUBLIC_PATHS.some((prefix) =>
    pathname.startsWith(prefix)
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Always allow public routes
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Allow Next.js internals + static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next()
  }

  // Create response for Supabase cookie handling
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createMiddlewareAuthClient(request, response)

    // Refresh/check session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // No session → redirect to login
    if (!session) {
      const loginUrl = new URL('/auth/login', request.url)

      loginUrl.searchParams.set('redirect', pathname)

      return NextResponse.redirect(loginUrl)
    }

    // Session exists → continue
    return response

  } catch (error) {
    console.error('[Middleware Error]', error)

    const loginUrl = new URL('/auth/login', request.url)

    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```
