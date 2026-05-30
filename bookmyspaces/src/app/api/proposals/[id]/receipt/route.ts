// src/app/api/proposals/[id]/receipt/route.ts
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'

function inr(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN')
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return d }
}

function modeLabel(mode: string): string {
  const map: Record<string, string> = {
    cash: 'Cash', upi: 'UPI', card: 'Card',
    bank_transfer: 'Bank Transfer', cheque: 'Cheque',
  }
  return map[mode] ?? mode
}

function buildReceiptHTML(proposal: any, payment: any): string {
  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${payment.receipt_number} — BookMySpaces</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a1a;background:#fff;font-size:13px;line-height:1.5}
.page{max-width:600px;margin:0 auto}

.header{background:linear-gradient(135deg,#0b1520 0%,#162038 100%);padding:24px 36px;display:flex;justify-content:space-between;align-items:flex-start}
.brand-name{font-family:'Cormorant Garamond',serif;font-size:22px;color:#fff;font-weight:400;letter-spacing:.3px}
.brand-tag{font-size:9px;color:#c9a84c;letter-spacing:.2em;text-transform:uppercase;margin-top:3px}
.receipt-badge{text-align:right}
.receipt-label{font-size:9px;color:rgba(255,255,255,.4);letter-spacing:.15em;text-transform:uppercase;margin-bottom:3px}
.receipt-number{font-size:16px;font-weight:600;color:#c9a84c;letter-spacing:.05em}
.receipt-date{font-size:10px;color:rgba(255,255,255,.4);margin-top:3px}

.gold-rule{height:1px;background:linear-gradient(90deg,#c9a84c 0%,rgba(201,168,76,.1) 100%)}

.receipt-title{background:#f8f5f0;padding:14px 36px;border-bottom:1px solid #ede8e0}
.receipt-title-text{font-family:'Cormorant Garamond',serif;font-size:20px;color:#0b1520;font-weight:400;letter-spacing:.2px}
.receipt-title-sub{font-size:10px;color:#8a8a9a;letter-spacing:.12em;text-transform:uppercase;margin-top:2px}

.body{padding:20px 36px}

.amount-hero{background:linear-gradient(135deg,#0b1520,#162038);border-radius:10px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.amount-label{font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.15em;margin-bottom:4px}
.amount-value{font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:600;color:#c9a84c}
.amount-words{font-size:10px;color:rgba(255,255,255,.4);margin-top:3px}
.mode-badge{background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.3);border-radius:8px;padding:8px 14px;text-align:center}
.mode-icon{font-size:18px;margin-bottom:3px}
.mode-label{font-size:10px;color:#c9a84c;font-weight:600;text-transform:uppercase;letter-spacing:.1em}

.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.detail-item{background:#f8f5f0;border-radius:7px;padding:10px 12px;border-left:2px solid #c9a84c}
.detail-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.14em;color:#8a8a9a;margin-bottom:3px}
.detail-value{font-size:12px;color:#1a1a1a;font-weight:500}

.purpose-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.purpose-icon{font-size:18px}
.purpose-label{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#15803d;margin-bottom:2px}
.purpose-text{font-size:12px;color:#166534;font-weight:500}

.ref-box{background:#f8f5f0;border-radius:7px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
.ref-label{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#8a8a9a}
.ref-value{font-size:12px;color:#1a1a1a;font-weight:600;font-family:monospace;letter-spacing:.05em}

.footer{padding:14px 36px 18px;background:#f8f5f0;border-top:1px solid #ede8e0}
.footer-contact{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:8px}
.footer-item{font-size:10px;color:#6a6a7a}
.footer-item-label{font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:#9a9aaa;margin-bottom:1px}

.closing{padding:12px 36px 16px;text-align:center}
.closing-rule{height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.3) 30%,rgba(201,168,76,.3) 70%,transparent);margin-bottom:10px}
.closing-text{font-size:9px;color:#9a9aaa;line-height:1.65}
.closing-ref{display:inline-block;margin-top:6px;font-size:8.5px;font-weight:600;color:rgba(201,168,76,.65);letter-spacing:.16em;text-transform:uppercase;border-top:1px solid rgba(201,168,76,.2);padding-top:4px}

@media print{
  @page{size:A5;margin:0}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{overflow:visible!important}
}
</style>
</head>
<body>
<div class="page">

<div class="header">
  <div>
    <div class="brand-name">BookMySpaces</div>
    <div class="brand-tag">Premium Hospitality · Kolkata</div>
  </div>
  <div class="receipt-badge">
    <div class="receipt-label">Money Receipt</div>
    <div class="receipt-number">${payment.receipt_number}</div>
    <div class="receipt-date">${fmtDate(payment.payment_date)}</div>
  </div>
</div>
<div class="gold-rule"></div>

<div class="receipt-title">
  <div class="receipt-title-text">Payment Acknowledgement</div>
  <div class="receipt-title-sub">Official Money Receipt · BookMySpaces</div>
</div>

<div class="body">

  <div class="amount-hero">
    <div>
      <div class="amount-label">Amount Received</div>
      <div class="amount-value">${inr(Number(payment.amount))}</div>
      <div class="amount-words">Indian Rupees · ${today}</div>
    </div>
    <div class="mode-badge">
      <div class="mode-icon">${payment.payment_mode === 'upi' ? '📱' : payment.payment_mode === 'cash' ? '💵' : payment.payment_mode === 'card' ? '💳' : '🏦'}</div>
      <div class="mode-label">${modeLabel(payment.payment_mode)}</div>
    </div>
  </div>

  <div class="detail-grid">
    <div class="detail-item">
      <div class="detail-label">Received From</div>
      <div class="detail-value">${proposal.client_name}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Contact</div>
      <div class="detail-value">${proposal.client_phone || '—'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Proposal Reference</div>
      <div class="detail-value">${proposal.proposal_number}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Event Type</div>
      <div class="detail-value">${proposal.event_type || '—'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Payment Date</div>
      <div class="detail-value">${fmtDate(payment.payment_date)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Payment Type</div>
      <div class="detail-value" style="text-transform:capitalize">${(payment.payment_type || 'advance').replace('_', ' ')}</div>
    </div>
  </div>

  <div class="purpose-box">
    <div class="purpose-icon">✓</div>
    <div>
      <div class="purpose-label">Purpose</div>
      <div class="purpose-text">Advance payment against booking — ${proposal.proposal_number}</div>
    </div>
  </div>

  ${payment.transaction_ref ? `
  <div class="ref-box">
    <span class="ref-label">Transaction Reference</span>
    <span class="ref-value">${payment.transaction_ref}</span>
  </div>` : ''}

  ${payment.notes ? `
  <div style="padding:10px 14px;background:#fff8e8;border-radius:7px;border:1px solid rgba(201,168,76,.25);font-size:11px;color:#4a4a5a;margin-bottom:0">
    <span style="font-size:8.5px;text-transform:uppercase;letter-spacing:.12em;color:#c9a84c;font-weight:600">Notes · </span>${payment.notes}
  </div>` : ''}

</div>

<div class="footer">
  <div class="footer-contact">
    <div class="footer-item">
      <div class="footer-item-label">WhatsApp / Call</div>
      9051459463
    </div>
    <div class="footer-item">
      <div class="footer-item-label">UPI</div>
      9836014495@upi
    </div>
    <div class="footer-item">
      <div class="footer-item-label">Address</div>
      Mukundapur, Near EM Bypass, Kolkata
    </div>
  </div>
</div>

<div class="closing">
  <div class="closing-rule"></div>
  <div class="closing-text">
    <strong style="color:#6a6a7a">Digitally Generated Receipt</strong><br>
    This document has been generated through the BookMySpaces system and is valid without a physical signature.
  </div>
  <div class="closing-ref">Receipt: ${payment.receipt_number}</div>
</div>

</div>
</body>
</html>`
}

// ─── GET — generate receipt PDF for latest/specific payment ──────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseAdmin()
  try {
    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('payment_id')

    // Fetch proposal
    const { data: proposal, error: propErr } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', params.id)
      .single()

    if (propErr || !proposal) {
      return new NextResponse('Proposal not found', { status: 404 })
    }

    // Fetch specific payment or latest
    const query = supabase
      .from('payments')
      .select('*')
      .eq('proposal_id', params.id)
      .order('created_at', { ascending: false })

    const { data: payments, error: payErr } = paymentId
      ? await supabase.from('payments').select('*').eq('id', paymentId).single().then(r => ({ data: r.data ? [r.data] : null, error: r.error }))
      : await query.limit(1)

    if (payErr || !payments || payments.length === 0) {
      return new NextResponse('No payment found for this proposal', { status: 404 })
    }

    const payment = payments[0]
    const html    = buildReceiptHTML(proposal, payment)

    const filename = `BookMySpaces-Receipt-${payment.receipt_number}.pdf`

    return new NextResponse(html, {
      headers: {
        'Content-Type'       : 'text/html; charset=utf-8',
        'Content-Disposition': `filename="${filename}"`,
        'Cache-Control'      : 'no-store',
      },
    })
  } catch (err) {
    logger.error('receipt', 'GET failed', err)
    return new NextResponse(
      `Receipt generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    )
  }
}
