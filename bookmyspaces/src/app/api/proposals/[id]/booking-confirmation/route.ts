// src/app/api/proposals/[id]/booking-confirmation/route.ts
// Staff-triggered "send booking confirmation" action, for once a proposal
// has actually been confirmed (lead_stage/proposal status = CONFIRMED).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-guard'
import { sendBookingConfirmationEmail } from '@/lib/email/send'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const db = getSupabaseAdmin()

  try {
    const body = await req.json().catch(() => ({}))
    const recipientEmail: string | undefined = body?.recipient_email

    const { data: proposal, error: propErr } = await db
      .from('proposals')
      .select('*, leads(name, phone, email)')
      .eq('id', params.id)
      .single()
    if (propErr || !proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

    const toEmail = recipientEmail || proposal.client_email || (proposal.leads as any)?.email || ''
    const clientName = proposal.client_name || (proposal.leads as any)?.name || 'Valued Client'
    if (!toEmail) return NextResponse.json({ error: 'No recipient email available for this proposal' }, { status: 400 })

    const result = await sendBookingConfirmationEmail(
      toEmail,
      {
        clientName,
        proposalNumber: proposal.proposal_number,
        eventType: proposal.event_type,
        eventDate: proposal.event_date,
        venue: proposal.venue,
        guestCount: proposal.guest_count,
      },
      { to: toEmail, relatedEntityType: 'proposal', relatedEntityId: params.id }
    )

    if (result.providerNotConfigured) {
      return NextResponse.json({
        success: false,
        error: 'No email provider configured yet. Set RESEND_API_KEY in your environment to enable sending.',
      }, { status: 503 })
    }
    if (!result.success) {
      logger.error('booking-confirmation-email', 'Send failed', result.error, { proposal_id: params.id })
      return NextResponse.json({ error: 'Email send failed', detail: result.error }, { status: 502 })
    }

    return NextResponse.json({ success: true, sent_to: toEmail, provider_message_id: result.providerMessageId })
  } catch (err) {
    logger.error('booking-confirmation-email', 'Route failed', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
