export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ─────────────────────────────────────────
// GET /api/proposal/share/[token]
// Public endpoint — no auth required.
// Returns only the fields needed for client-facing view.
// Does NOT expose: lead_id, internal notes, CRM status details.
// ─────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const { data: proposal, error } = await supabaseAdmin
    .from('proposals')
    .select(`
      id,
      proposal_number,
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
      ai_cover_note,
      notes,
      status,
      share_token,
      expires_at,
      created_at
    `)
    .eq('share_token', token)
    .single()

  if (error || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  // Return public-safe proposal (no internal fields like lead_id)
  return NextResponse.json({ proposal })
}
