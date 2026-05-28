import { NextResponse, type NextRequest } from 'next/server'

/**
 * /auth/callback
 *
 * With the Server Action login flow, this route is only needed for:
 * - OAuth providers (Google, GitHub, etc.)
 * - Magic link / OTP flows
 * - PKCE code exchange
 *
 * For password login via Server Action, you never hit this route.
 * It's kept here so OAuth works if you add it later.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const safeNext = next.startsWith('/') ? next : '/dashboard'

  if (code) {
    // Dynamic import to avoid issues if @supabase/ssr isn't installed yet
    const { createServerClient } = await import('@supabase/ssr')
    const { cookies } = await import('next/headers')

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, origin)
      )
    }

    return NextResponse.redirect(new URL(safeNext, origin))
  }

  // No code — redirect to login
  return NextResponse.redirect(new URL('/auth/login', origin))
}
