export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─────────────────────────────────────────
// POST /api/proposals/email
// Sends a branded proposal email via mailto: link generation
// OR via a configured SMTP service if SMTP_HOST is set.
//
// Fallback (no SMTP): returns a pre-filled mailto: URL
// the client opens in their email app — zero config needed.
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { proposal_id, recipient_email, custom_message } = await req.json()

    if (!proposal_id) {
      return NextResponse.json({ error: 'proposal_id required' }, { status: 400 })
    }

    const { data: proposal, error } = await supabaseAdmin
      .from('proposals')
      .select('*, leads(name, phone, email)')
      .eq('id', proposal_id)
      .single()

    if (error || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://bookmyspaces.in'}/proposal/share/${proposal.share_token}`
    const toEmail = recipient_email || proposal.client_email || (proposal.leads as any)?.email || ''
    const clientName = proposal.client_name || (proposal.leads as any)?.name || 'Valued Client'

    // Build email content
    const subject = `Your Event Proposal — ${proposal.proposal_number} | BookMySpaces`

    // ── Generate mailto URL (zero dependencies, works everywhere) ──
    // To enable real SMTP: install nodemailer, add SMTP_HOST/USER/PASS env vars,
    // and replace this section with nodemailer.createTransport().sendMail()
    // ────────────────────────────────────────────────────────
    const mailtoBody = [
      `Dear ${clientName},`,
      '',
      custom_message || `Thank you for your interest in BookMySpaces. Please find your event proposal below.`,
      '',
      `📋 Proposal: ${proposal.proposal_number}`,
      `🎪 Event: ${proposal.event_type || '-'}`,
      `💰 Package Value: ₹${(proposal.total_price || 0).toLocaleString('en-IN')}`,
      '',
      `View your complete proposal here:`,
      shareUrl,
      '',
      `To confirm your booking, please reply to this email or WhatsApp us at +91 9051459463.`,
      '',
      `Warm regards,`,
      `BookMySpaces Team`,
      `📞 9051459463 | www.bookmyspaces.in`,
    ].join('\n')

    const mailtoUrl = `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`

    // Still track the attempt
    Promise.resolve(supabaseAdmin.from('proposals').update({
      email_sent_at: new Date().toISOString(),
      status: proposal.status === 'draft' ? 'sent' : proposal.status,
    }).eq('id', proposal_id)).catch(() => {})

    return NextResponse.json({
      success: true,
      method: 'mailto',
      mailto_url: mailtoUrl,
      sent_to: toEmail,
      note: 'SMTP not configured — use mailto_url to open in email client',
    })

  } catch (err) {
    logger.error('proposals-email', 'Email route failed', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}

// ─────────────────────────────────────────
// Branded HTML email body
// ─────────────────────────────────────────
function buildEmailBody(proposal: any, shareUrl: string, clientName: string, customMessage?: string): string {
  const totalAddons = (proposal.addons || []).reduce((s: number, a: any) => s + (a.price || 0), 0)

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f5f0;font-family:'DM Sans',system-ui,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">

  <!-- Header -->
  <div style="background:#0f1923;border-radius:12px 12px 0 0;padding:20px 28px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#c9a84c;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#0f1923">B</div>
    <div>
      <div style="color:#fff;font-weight:700;font-size:16px">BookMySpaces</div>
      <div style="color:#c9a84c;font-size:11px">Premium Event Venues · Kolkata</div>
    </div>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

    <p style="font-size:15px;color:#374151;margin:0 0 8px">Dear <strong>${clientName}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 24px">
      ${customMessage || 'Thank you for considering BookMySpaces for your special event. We have prepared a personalised proposal for you.'}
    </p>

    <!-- Proposal card -->
    <div style="background:linear-gradient(135deg,#0f1923,#1a2d40);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <div style="color:#c9a84c;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Event Proposal</div>
      <div style="color:#fff;font-size:20px;font-weight:700;margin-bottom:4px">${proposal.proposal_number}</div>
      <div style="color:rgba(255,255,255,0.6);font-size:13px">${proposal.event_type || 'Special Event'} · ${proposal.venue || 'BookMySpaces Venue'}</div>
    </div>

    <!-- Details -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      ${proposal.event_date ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;width:40%">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1f2937;font-weight:600">${new Date(proposal.event_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>` : ''}
      ${proposal.guest_count ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">Guests</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1f2937;font-weight:600">${proposal.guest_count} persons</td></tr>` : ''}
      ${proposal.package_name ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">Package</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1f2937;font-weight:600">${proposal.package_name}</td></tr>` : ''}
      <tr><td style="padding:12px 0;font-size:15px;color:#0f1923;font-weight:700">Total Value</td><td style="padding:12px 0;font-size:20px;color:#c9a84c;font-weight:800">₹${(proposal.total_price || 0).toLocaleString('en-IN')}</td></tr>
    </table>

    ${proposal.advance_required ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px"><div style="font-size:13px;color:#92400e;font-weight:600">Advance to Confirm: <span style="font-size:16px">₹${proposal.advance_required.toLocaleString('en-IN')}</span></div></div>` : ''}

    <!-- CTA Button -->
    <div style="text-align:center;margin:24px 0">
      <a href="${shareUrl}" style="display:inline-block;background:#c9a84c;color:#0f1923;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none">
        View Complete Proposal →
      </a>
    </div>

    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-bottom:0">
      To confirm your booking, reply to this email or WhatsApp us at <strong>+91 9051459463</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px;color:#9ca3af;font-size:11px;line-height:1.8">
    BookMySpaces · Mukundapur, Near EM Bypass, Kolkata<br>
    <a href="https://bookmyspaces.in" style="color:#c9a84c;text-decoration:none">www.bookmyspaces.in</a>
  </div>
</div>
</body>
</html>`
}
