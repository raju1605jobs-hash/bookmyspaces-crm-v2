export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { proposal_id, recipient_email, custom_message } = await req.json()
    if (!proposal_id) return NextResponse.json({ error: 'proposal_id required' }, { status: 400 })

    const { data: proposal, error } = await supabaseAdmin.from('proposals').select('*, leads(name, phone, email)').eq('id', proposal_id).single()
    if (error || !proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://bookmyspaces.in'}/proposal/share/${proposal.share_token}`
    const toEmail = recipient_email || proposal.client_email || (proposal.leads as any)?.email || ''
    const clientName = proposal.client_name || (proposal.leads as any)?.name || 'Valued Client'
    const subject = `Your Event Proposal — ${proposal.proposal_number} | BookMySpaces`

    const mailtoBody = [
      `Dear ${clientName},`, '',
      custom_message || `Thank you for your interest in BookMySpaces. Please find your event proposal below.`, '',
      `📋 Proposal: ${proposal.proposal_number}`,
      `🎪 Event: ${proposal.event_type || '-'}`,
      `💰 Package Value: ₹${(proposal.total_price || 0).toLocaleString('en-IN')}`, '',
      `View your complete proposal here:`, shareUrl, '',
      `To confirm your booking, please reply to this email or WhatsApp us at +91 9051459463.`, '',
      `Warm regards,`, `BookMySpaces Team`, `📞 9051459463 | www.bookmyspaces.in`,
    ].join('\n')

    const mailtoUrl = `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`

    Promise.resolve(supabaseAdmin.from('proposals').update({ email_sent_at: new Date().toISOString(), status: proposal.status === 'draft' ? 'sent' : proposal.status }).eq('id', proposal_id)).catch(() => {})

    return NextResponse.json({ success: true, method: 'mailto', mailto_url: mailtoUrl, sent_to: toEmail, note: 'SMTP not configured — use mailto_url to open in email client' })
  } catch (err) {
    logger.error('proposals-email', 'Email route failed', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
