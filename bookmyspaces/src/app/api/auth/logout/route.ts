// src/app/api/auth/logout/route.ts
// Signs out the current user and redirects to login.

import { NextResponse } from 'next/server'
import { createServerAuthClient } from '@/lib/supabase-auth'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<NextResponse> {
  const supabase = createServerAuthClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/auth/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
}

// Also support GET for convenience (e.g. a plain link)
export async function GET(): Promise<NextResponse> {
  const supabase = createServerAuthClient()
  await supabase.auth.signOut()
  const response = NextResponse.redirect(
    new URL('/auth/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
  )
  return response
}
