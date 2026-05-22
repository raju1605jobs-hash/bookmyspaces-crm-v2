// src/app/api/admin/users/route.ts
// Admin-only user management API.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

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
    }

    return NextResponse.json({ success: true })

  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

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

    return NextResponse.json({ success: true, user_id: authData.user.id })

  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
