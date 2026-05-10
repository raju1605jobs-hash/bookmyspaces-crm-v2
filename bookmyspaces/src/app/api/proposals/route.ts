export const dynamic = 'force-dynamic'
import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateProposalCoverNote } from '@/lib/scoring'
import { parseEventDate } from '@/lib/ai'
import { generateProposalHTML } from '@/lib/proposal-pdf'

export const runtime = 'nodejs'
export const maxDuration = 30

// GET — list proposals
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('lead_id')
    const status = searchParams.get('status')
    const id = searchParams.get('id')

    // Single proposal by ID
    if (id) {
      const { data, error } = await supabaseAdmin
        .from('proposals')
        .select('*, leads(name, phone, email)')
        .eq('id', id)
        .single()
      if (error) throw error
      return NextResponse.json({ proposal: data })
    }

    let query = supabaseAdmin
      .from('proposals')
      .select('*, leads(name, phone, email)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (leadId) query = query.eq('lead_id', leadId)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query.limit(50)
    if (error) throw error

    return NextResponse.json({ proposals: data, total: count })
  } catch (err) {
    logger.error('proposals', 'GET failed', err)
    return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 })
  }
}

// POST — create proposal (with AI cover note)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      lead_id,
      client_name,
      client_phone,
      client_email,
      event_type,
      event_date,
      event_time,
      guest_count,
      venue,
      package_name,
      base_price,
      addons = [],
      discount_amount = 0,
      discount_reason,
      special_requirements,
      inclusions,
      generate_cover_note = true,
    } = body

    // Calculate total
    const addons_total = addons.reduce(
      (sum: number, a: { price: number }) => sum + (a.price || 0),
      0
    )
    const total_price = base_price + addons_total - (discount_amount || 0)
    const advance_required = Math.round(total_price * 0.3)

    const proposalData = {
      client_name,
      client_phone,
      client_email,
      event_type,
      event_date,
      event_time,
      guest_count,
      venue,
      package_name,
      base_price,
      addons,
      discount_amount,
      discount_reason,
      total_price,
      advance_required,
      special_requirements,
      inclusions,
    }

    // Generate AI cover note
    let ai_cover_note = null
    if (generate_cover_note) {
      ai_cover_note = await generateProposalCoverNote(proposalData)
    }

    // Create in DB
    const { data: proposal, error } = await supabaseAdmin
      .from('proposals')
      .insert({
        lead_id: lead_id || null,
        client_name,
        client_phone,
        client_email,
        event_type,
        event_date: parseEventDate(event_date) || null, // safely convert string to DATE type
        event_time,
        guest_count: guest_count ? parseInt(guest_count) : null,
        venue,
        package_name,
        base_price,
        addons,
        discount_amount,
        discount_reason,
        total_price,
        advance_required,
        special_requirements,
        inclusions,
        ai_cover_note,
        status: 'draft',
      })
      .select('*')
      .single()

    if (error) throw error

    // Update lead status
    if (lead_id) {
      await supabaseAdmin
        .from('leads')
        .update({ status: 'proposal_sent', proposal_sent_at: new Date().toISOString() })
        .eq('id', lead_id)

      await supabaseAdmin.from('activity_logs').insert({
        lead_id,
        action: 'proposal_created',
        description: `Proposal ${proposal.proposal_number} created: ${package_name} — ₹${total_price.toLocaleString('en-IN')}`,
        performed_by: 'admin',
      })
    }

    return NextResponse.json({ proposal }, { status: 201 })
  } catch (err) {
    logger.error('proposals', 'POST failed', err)
    return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 })
  }
}

// PATCH — update proposal status
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'Proposal ID required' }, { status: 400 })

    const { data: proposal, error } = await supabaseAdmin
      .from('proposals')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    // Log status change
    if (updates.status === 'sent' && proposal.lead_id) {
      await supabaseAdmin.from('activity_logs').insert({
        lead_id: proposal.lead_id,
        action: 'proposal_sent',
        description: `Proposal ${proposal.proposal_number} sent to client`,
        performed_by: 'admin',
      })
    }

    return NextResponse.json({ proposal })
  } catch (err) {
    logger.error('proposals', 'PATCH failed', err)
    return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 })
  }
}
