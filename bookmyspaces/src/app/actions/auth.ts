'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

// ─────────────────────────────────────────────────────────────────────────────
// Create Supabase server client
// ─────────────────────────────────────────────────────────────────────────────
function createSupabaseServerClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },

        setAll(
          cookiesToSet: {
            name: string
            value: string
            options: any
          }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Login action
// ─────────────────────────────────────────────────────────────────────────────
export async function login(formData: FormData) {
  const supabase = createSupabaseServerClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return {
      error: error.message,
    }
  }

  redirect('/dashboard')
}

// ─────────────────────────────────────────────────────────────────────────────
// Logout action
// ─────────────────────────────────────────────────────────────────────────────
export async function logout() {
  const supabase = createSupabaseServerClient()

  await supabase.auth.signOut()

  redirect('/auth/login')
}
```
