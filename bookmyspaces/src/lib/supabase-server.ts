// src/lib/supabase-server.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Supabase auth client.
// Safe to import in:
//   - Route Handlers  (src/app/api/**/route.ts)
//   - Server Components (no 'use client' directive)
//   - Server Actions
//
// MUST NOT be imported by any 'use client' component.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CookieOptions } from '@supabase/ssr'
import { getSupabaseAdmin } from '@/lib/supabase'

export function createServerAuthClient() {
  const cookieStore = cookies()

  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch { /* read-only context */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch { /* read-only context */ }
        },
      },
    }
  )
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'sales' | 'marketing'

export interface AuthUser {
  id        : string
  email     : string
  full_name : string | null
  role      : UserRole
  is_active : boolean
}

// ─── Server-side auth helpers ─────────────────────────────────────────────────

/**
 * Get the current authenticated user from a Server Component or Route Handler.
 * Returns null if not authenticated or inactive.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const supabase = createServerAuthClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session?.user) return null

    const db = getSupabaseAdmin()
    const { data: profile } = await db
      .from('user_profiles')
      .select('full_name, role, is_active')
      .eq('id', session.user.id)
      .single()

    if (!profile?.is_active) return null

    return {
      id        : session.user.id,
      email     : session.user.email ?? '',
      full_name : profile.full_name   ?? null,
      role      : (profile.role as UserRole) ?? 'sales',
      is_active : profile.is_active   ?? true,
    }
  } catch {
    return null
  }
}

/**
 * Check if a role has permission to perform a named action.
 */
export function hasPermission(role: UserRole, action: string): boolean {
  const PERMISSIONS: Record<string, UserRole[]> = {
    view_dashboard   : ['sales', 'marketing', 'manager', 'admin'],
    manage_leads     : ['sales', 'manager', 'admin'],
    send_proposals   : ['sales', 'manager', 'admin'],
    manage_campaigns : ['marketing', 'manager', 'admin'],
    manage_users     : ['admin'],
    view_admin_panel : ['manager', 'admin'],
    delete_records   : ['admin'],
    assign_leads     : ['manager', 'admin'],
  }
  return PERMISSIONS[action]?.includes(role) ?? false
}
