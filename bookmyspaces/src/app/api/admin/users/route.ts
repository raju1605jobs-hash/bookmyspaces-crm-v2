// src/app/api/admin/users/route.ts
// Admin-only user management API.
// ISS-003 (audit/MASTER_ISSUE_REGISTER.csv): the old checks compared
// user.role (raw GoTrue auth role, never 'admin'/'manager') instead of
// joining against user_profiles.role. Now uses requireRole(), which does
// that join (src/lib/auth-guard.ts). user_profiles confirmed present on the
// live database (SCHEMA_DRIFT_REPORT.md, Category A).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireRole } from '@/lib/auth-guard'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireRole(['admin', 'manager'])
    if (!auth.ok) return auth.response

    const db = getSupabaseAdmin()
    const { data, error } = await db
      .from('active_users_view')
      .select('*')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ users: data ?? [] })

  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response
    const { user } = auth

    const body = await req.json() as {
      user_id   : string
      action    : 'set_role' | 'deactivate' | 'activate'
      role     ?: string
    }

    const db = getSupabaseAdmin()

    if (body.action === 'set_role' && body.role) {
      const { error } = await db
        .from('user_profiles')
        .update({ role: body.role, updated_at: new Date().toISOString() })
        .eq('id', body.user_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // RC1 security fix: role changes and activation/deactivation had no
      // audit trail at all — a security-sensitive admin action left no
      // record of who performed it. A dedicated audit_log table is a
      // schema change out of scope for this pass (see
      // RELEASE_CANDIDATE_1_REPORT.md); this at minimum makes the action
      // and actor visible in structured logs immediately.
      logger.info('admin/users', 'role changed', { actorId: user.id, targetUserId: body.user_id, newRole: body.role })
    }

    if (body.action === 'deactivate' || body.action === 'activate') {
      const { error } = await db
        .from('user_profiles')
        .update({
          is_active  : body.action === 'activate',
          updated_at : new Date().toISOString(),
        })
        .eq('id', body.user_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      logger.info('admin/users', `user ${body.action}d`, { actorId: user.id, targetUserId: body.user_id })
    }

    return NextResponse.json({ success: true })

  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response
    const { user } = auth

    const body = await req.json() as {
      email     : string
      password  : string
      full_name : string
      role      : string
      phone    ?: string
    }

    const db       = getSupabaseAdmin()
    const supabase = db  // service role has admin auth access

    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email            : body.email,
      password         : body.password,
      email_confirm    : true,
    })

    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? 'Failed to create user' }, { status: 500 })
    }

    // Create profile
    const { error: profileErr } = await db
      .from('user_profiles')
      .insert({
        id         : authData.user.id,
        full_name  : body.full_name,
        role       : body.role,
        phone      : body.phone ?? null,
        is_active  : true,
        created_by : user.id,
      })

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    logger.info('admin/users', 'user created', { actorId: user.id, newUserId: authData.user.id, role: body.role })

    return NextResponse.json({ success: true, user_id: authData.user.id })

  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
