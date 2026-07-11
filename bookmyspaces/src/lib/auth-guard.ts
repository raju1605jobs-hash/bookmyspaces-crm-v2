// src/lib/auth-guard.ts
// ─────────────────────────────────────────────────────────────────────────────
// ISS-001/ISS-002 (audit/MASTER_ISSUE_REGISTER.csv): shared session-check helper
// for API route handlers. Built once so every protected route uses the same
// logic (per ISS-002's own CSV dependency note: "ISS-001 shared auth helper
// should be built once"). Uses the existing getCurrentUser() (supabase-server.ts),
// which is the same Supabase Auth session check already used by the 3 routes
// that had auth before this pass (admin/users, notifications, leads/import) —
// this fix does not introduce a new auth mechanism, just applies the existing
// one everywhere it was missing.
//
// Usage in a route handler:
//   const auth = await requireAuth()
//   if (!auth.ok) return auth.response
//   const { user } = auth
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse }

// ─── Require any authenticated session ─────────────────────────────────────
export async function requireAuth(): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized — please log in' }, { status: 401 }),
    }
  }
  return { ok: true, user }
}

// ─── Require an authenticated session AND an admin/manager role ───────────
// ISS-003: unlike the old check, this joins the authenticated user's ID against
// `user_profiles.role` instead of comparing the raw GoTrue auth role (which is
// never 'admin'/'manager' — see AUTH_AUDIT.md). `user_profiles` is confirmed
// present on the live database (SCHEMA_DRIFT_REPORT.md, Category A).
export async function requireRole(
  allowedRoles: readonly string[]
): Promise<AuthResult> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const db = getSupabaseAdmin()
  const { data: profile, error } = await db
    .from('user_profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (error || !profile || !allowedRoles.includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 }),
    }
  }

  return auth
}
