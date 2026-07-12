// src/app/api/proposals/[id]/invoice/email/route.ts
// Sends the invoice-summary email to a customer. Separate from the existing
// src/app/api/proposals/[id]/invoice/route.ts, which only renders an invoice
// page/PDF for staff — this route is the new "actually email it" action.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-guard'
import { sendInvoiceEmail } from '@/lib/email/send'

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

    const { data: invoice } = await db
      .from('invoices')
      .select('invoice_number, total_amount, balance_due')
      .eq('proposal_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const toEmail = recipientEmail || proposal.client_email || (proposal.leads as any)?.email || ''
    const clientName = proposal.client_name || (proposal.leads as any)?.name || 'Valued Client'
    if (!toEmail) return NextResponse.json({ error: 'No recipient email available for this proposal' }, { status: 400 })

    const result = await sendInvoiceEmail(
      toEmail,
      {
        clientName,
        invoiceNumber: invoice?.invoice_number || `${proposal.proposal_number}-INV`,
        proposalNumber: proposal.proposal_number,
        totalAmount: invoice?.total_amount ?? proposal.total_price ?? 0,
        balanceDue: invoice?.balance_due ?? proposal.total_price ?? 0,
        eventType: proposal.event_type,
        eventDate: proposal.event_date,
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
      logger.error('invoice-email', 'Send failed', result.error, { proposal_id: params.id })
      return NextResponse.json({ error: 'Email send failed', detail: result.error }, { status: 502 })
    }

    return NextResponse.json({ success: true, sent_to: toEmail, provider_message_id: result.providerMessageId })
  } catch (err) {
    logger.error('invoice-email', 'Route failed', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
