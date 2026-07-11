// src/lib/auth-callback.ts
// ISS-027: shared implementation for the Supabase auth callback (OAuth / magic-link /
// email-confirmation code exchange). Previously there were two independent, divergent
// implementations (src/app/api/auth/callback/route.ts and src/app/auth/callback/route.ts)
// with different redirect-param names and different failure targets — one of which
// (ISS-028) pointed at a page that doesn't exist. Both route files now delegate to this
// single function so there is exactly one place that owns cookie handling and the
// success/failure redirect logic. Both URL paths are kept alive (rather than deleting
// one) since it is unknown, without access to the live Supabase project's configured
// redirect URLs / email templates, which path is actually referenced externally —
// removing one would risk silently breaking magic-link or OAuth sign-in for real users.

import { NextRequest, NextResponse } from 'next/server'
import { createServerAuthClient } from '@/lib/supabase-server'

export async function handleAuthCallback(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Accept either param name — the two legacy implementations used different ones
  // (`redirect` vs `next`); supporting both keeps any existing generated links working.
  const redirectTo = searchParams.get('redirect') ?? searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createServerAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // ISS-028: previously redirected to the non-existent /auth/auth-code-error page (404).
  // /auth/login does exist and now reads ?error= to show a real message (see login/page.tsx).
  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`)
}
