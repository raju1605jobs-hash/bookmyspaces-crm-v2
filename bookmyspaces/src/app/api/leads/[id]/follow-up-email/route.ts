// src/app/api/leads/[id]/follow-up-email/route.ts
// Staff-triggered "send a follow-up email" action for a specific lead.
// This is separate from the existing WhatsApp follow-up system
// (src/app/api/followups/route.ts, src/app/api/cron/followups/route.ts) —
// this is the email channel, added as part of the new email system.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-guard'
import { sendFollowUpEmail } from '@/lib/email/send'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const db = getSupabaseAdmin()

  try {
    const body = await req.json().catch(() => ({}))
    const recipientEmail: string | undefined = body?.recipient_email
    const customMessage: string | undefined = body?.custom_message

    const { data: lead, error: leadErr } = await db
      .from('leads')
      .select('id, name, email, event_type')
      .eq('id', params.id)
      .single()
    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const toEmail = recipientEmail || lead.email || ''
    const clientName = lead.name || 'there'
    if (!toEmail) return NextResponse.json({ error: 'No email address on file for this lead' }, { status: 400 })

    const result = await sendFollowUpEmail(
      toEmail,
      { clientName, eventType: lead.event_type ?? undefined, customMessage },
      { to: toEmail, relatedEntityType: 'lead', relatedEntityId: params.id }
    )

    if (result.providerNotConfigured) {
      return NextResponse.json({
        success: false,
        error: 'No email provider configured yet. Set RESEND_API_KEY in your environment to enable sending.',
      }, { status: 503 })
    }
    if (!result.success) {
      logger.error('followup-email', 'Send failed', result.error, { lead_id: params.id })
      return NextResponse.json({ error: 'Email send failed', detail: result.error }, { status: 502 })
    }

    return NextResponse.json({ success: true, sent_to: toEmail, provider_message_id: result.providerMessageId })
  } catch (err) {
    logger.error('followup-email', 'Route failed', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
