export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { syncLeadToSheets } from '@/lib/sheets'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const source = searchParams.get('source')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabaseAdmin.from('leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (status && status !== 'all') query = query.eq('status', status)
    if (source && source !== 'all') query = query.eq('source', source)
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,event_type.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    const normalized = (data || []).map((l: any) => l.status === 'new' ? { ...l, status: 'new_inquiry' } : l)
    return NextResponse.json({ leads: normalized, total: count, limit, offset })
  } catch (error) {
    logger.error('leads', 'GET failed', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { data: lead, error } = await supabaseAdmin.from('leads').insert({
      name: body.name || null, phone: body.phone || null, email: body.email || null,
      event_type: body.event_type || null, event_date: body.event_date || null,
      guest_count: body.guest_count ? parseInt(body.guest_count) : null,
      budget: body.budget || null, special_requirements: body.special_requirements || null,
      venue: body.venue || null, source: body.source || 'website',
      status: body.status || 'new_inquiry', assigned_to: body.assigned_to || null, notes: body.notes || null,
    }).select('*').single()

    if (error) throw error

    await supabaseAdmin.from('activity_logs').insert({ lead_id: lead.id, action: 'lead_created', description: `Lead manually created from ${body.source || 'website'}`, performed_by: 'admin' })
    await syncLeadToSheets(lead)
    return NextResponse.json({ lead }, { status: 201 })
  } catch (error) {
    logger.error('leads', 'POST failed', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'Lead ID required' }, { status: 400 })

    const { data: lead, error } = await supabaseAdmin.from('leads').update(updates).eq('id', id).select('*').single()
    if (error) throw error

    if (updates.status) {
      await supabaseAdmin.from('activity_logs').insert({ lead_id: id, action: 'status_changed', description: `Status updated to: ${updates.status}`, performed_by: 'admin', metadata: { new_status: updates.status } })
    }

    syncLeadToSheets(lead).catch(err => logger.error('leads', 'Sheets re-sync failed', err))
    return NextResponse.json({ lead })
  } catch (error) {
    logger.error('leads', 'PATCH failed', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}
