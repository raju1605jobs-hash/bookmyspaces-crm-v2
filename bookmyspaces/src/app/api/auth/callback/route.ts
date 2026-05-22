// src/app/api/auth/callback/route.ts
// Handles Supabase auth callback (OAuth, magic links, email confirmation).
// Exchanges the code for a session then redirects.

import { NextRequest, NextResponse } from 'next/server'
import { createServerAuthClient } from '@/lib/supabase-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code     = searchParams.get('code')
  const redirect = searchParams.get('redirect') ?? '/dashboard'

  if (code) {
    const supabase = createServerAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // Failed — back to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`)
}
