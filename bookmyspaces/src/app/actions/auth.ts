'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Server Action: signIn
 *
 * WHY a Server Action instead of client-side signInWithPassword?
 *
 * When signInWithPassword runs in the BROWSER:
 *   - It sets cookies in the browser's cookie jar ✅
 *   - But middleware runs on the server and reads server-side cookies
 *   - The chunked sb-*-auth-token cookies from the browser client
 *     don't always reconstruct cleanly in the Route Handler → session_failed
 *
 * When signInWithPassword runs in a SERVER ACTION:
 *   - Supabase SSR writes cookies directly via next/headers cookies()
 *   - Middleware reads those same cookies instantly ✅
 *   - No callback route needed, no cookie format mismatch
 *   - redirect() inside a Server Action does a proper server-side redirect
 */
export async function signInAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = (formData.get('redirectTo') as string) || '/dashboard'

  // Validate redirectTo to prevent open redirect
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard'

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // This runs on the SERVER — cookies() is writable here
          // because we're inside a Server Action (not a Server Component render)
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Return the error message — the login page will display it
    // We can't use redirect() on error since we need to show the message
    return { error: error.message }
  }

  // Session is now set in server cookies — middleware will find it
  // redirect() throws internally (Next.js uses error boundaries), so
  // nothing after this line runs
  redirect(safeRedirect)
}

/**
 * Server Action: signOut
 */
export async function signOutAction() {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  await supabase.auth.signOut()
  redirect('/auth/login')
}
