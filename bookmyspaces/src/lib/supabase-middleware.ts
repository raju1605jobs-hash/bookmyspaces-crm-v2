// src/lib/supabase-middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Middleware-only Supabase client.
// Import ONLY from src/middleware.ts.
//
// Uses NextRequest/NextResponse cookies — not next/headers cookies().
// This distinction is critical: middleware runs in the Edge Runtime where
// next/headers is not available.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient as _createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export function createMiddlewareAuthClient(
  request : NextRequest,
  response: NextResponse
) {
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )
}
