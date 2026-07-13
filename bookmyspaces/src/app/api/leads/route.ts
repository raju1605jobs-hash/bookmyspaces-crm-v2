export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { syncLeadToSheets } from '@/lib/sheets'
import { requireAuth } from '@/lib/auth-guard'
import { parseBody, createLeadSchema, updateLeadSchema } from '@/lib/validation'
import { resolveIdentity } from '@/lib/identity/resolve-identity'

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

  // ISS-005: validated with createLeadSchema before touching the database —
  // previously any shape was accepted and bad types (e.g. a non-numeric
  // guest_count) surfaced as an opaque Postgres error instead of a clear 400.
  const parsed = await parseBody(req, createLeadSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const supabaseAdmin = getSupabaseAdmin()
  try {
    // V3 Day 2 — Identity Resolution (src/lib/identity/resolve-identity.ts),
    // per master spec: "Never create duplicate customers." `leads.phone` has
    // a UNIQUE constraint, so a phone match here means the insert below
    // would fail anyway — previously that surfaced as an opaque 500
    // ("Failed to create lead"). Returning the existing lead instead is a
    // bug fix, not a new restriction: this route never successfully created
    // a second lead with the same phone; it just failed ungracefully.
    //
    // An email-only match is lower confidence (leads.email is not unique,
    // per architecture review) — per "if confidence is low, flag the record
    // instead of merging automatically," this does NOT block or redirect
    // creation. It still creates the new lead exactly as before, and
    // attaches a note for human review instead of guessing.
    const identity = await resolveIdentity({ phone: body.phone, email: body.email })

    if (identity && identity.matchedOn === 'phone') {
      logger.info('leads', 'POST resolved to existing lead by phone — not creating a duplicate', { leadId: identity.leadId })
      const { data: existingLead } = await supabaseAdmin.from('leads').select('*').eq('id', identity.leadId).single()
      return NextResponse.json({ lead: existingLead, duplicate: true, matchedOn: 'phone' }, { status: 200 })
    }

    const possibleDuplicateLeadId = identity && identity.matchedOn === 'email' ? identity.leadId : null

    const { data: lead, error } = await supabaseAdmin.from('leads').insert({
      name: body.name || null, phone: body.phone || null, email: body.email || null,
      event_type: body.event_type || null, event_date: body.event_date || null,
      guest_count: body.guest_count ? parseInt(String(body.guest_count)) : null,
      budget: body.budget || null, special_requirements: body.special_requirements || null,
      venue: body.venue || null, source: body.source || 'website',
      status: body.status || 'new_inquiry', assigned_to: body.assigned_to || null, notes: body.notes || null,
    }).select('*').single()

    if (error) throw error

    await supabaseAdmin.from('activity_logs').insert({
      lead_id: lead.id,
      action: 'lead_created',
      description: `Lead manually created from ${body.source || 'website'}`,
      performed_by: 'admin',
      ...(possibleDuplicateLeadId && { metadata: { possible_duplicate_of: possibleDuplicateLeadId, matched_on: 'email' } }),
    })
    await syncLeadToSheets(lead)
    return NextResponse.json({
      lead,
      ...(possibleDuplicateLeadId && { possibleDuplicateOf: possibleDuplicateLeadId }),
    }, { status: 201 })
  } catch (error) {
    logger.error('leads', 'POST failed', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  // ISS-005: updateLeadSchema is a strict allow-list — this closes a mass-
  // assignment gap where the old `const { id, ...updates } = body` pattern
  // would forward ANY field straight into `.update()`, including columns the
  // UI never exposes (ai_score, created_at, etc.) or lead_stage, which has
  // its own validated transition path at /api/leads/[id]/stage and must not
  // be bypassed here.
  const parsed = await parseBody(req, updateLeadSchema)
  if (!parsed.ok) return parsed.response
  const { id, ...updates } = parsed.data

  const supabaseAdmin = getSupabaseAdmin()
  try {
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
