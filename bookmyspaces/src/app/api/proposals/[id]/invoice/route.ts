// src/app/api/proposals/[id]/invoice/route.ts
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'

function inr(n: number): string { return '₹' + Number(n).toLocaleString('en-IN') }
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return d }
}

function buildInvoiceHTML(proposal: any, invoice: any, payments: any[]): string {
  const today        = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const basePrice    = Number(proposal.base_price   || 0)
  const roomItems    = Array.isArray(proposal.room_items) ? proposal.room_items : []
  const addons       = Array.isArray(proposal.addons) ? proposal.addons : []
  const discountAmt  = Number(proposal.discount_amount || 0)
  const totalPrice   = Number(proposal.total_price  || 0)
  const advancePaid  = Number(proposal.advance_paid || payments.reduce((s:number, p:any) => s + Number(p.amount||0), 0))
  const balanceDue   = Math.max(0, totalPrice - advancePaid)

  const roomsTotal   = roomItems.reduce((s:number, r:any) =>
    s + (Number(r.quantity||0) * Number(r.rate||0) * Number(r.nights||0)), 0)

  const addonsTotal  = addons.reduce((s:number, a:any) => s + Number(a.price||0), 0)
  const hasEvent     = basePrice > 0
  const hasRooms     = roomItems.length > 0

  const roomRowsHtml = roomItems.map((r:any) => `
    <tr>
      <td class="td">🛏 ${r.room_type}</td>
      <td class="td c">${r.quantity} × ${r.nights} night${r.nights>1?'s':''}</td>
      <td class="td r">${inr(r.rate)} / night</td>
      <td class="td r b">${inr(r.quantity*r.rate*r.nights)}</td>
    </tr>`).join('')

  const addonRowsHtml = addons.map((a:any) => `
    <tr>
      <td class="td">+ ${a.name}</td>
      <td class="td c">—</td>
      <td class="td r">—</td>
      <td class="td r b">${inr(Number(a.price||0))}</td>
    </tr>`).join('')

  const paymentRowsHtml = payments.map((p:any) => `
    <tr>
      <td class="td">${p.receipt_number || '—'}</td>
      <td class="td">${fmtDate(p.payment_date)}</td>
      <td class="td" style="text-transform:capitalize">${(p.payment_mode||'').replace('_',' ')}</td>
      <td class="td r b">${inr(Number(p.amount))}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoice.invoice_number} — BookMySpaces</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a1a;background:#fff;font-size:12px;line-height:1.45}
.page{max-width:800px;margin:0 auto}

.header{background:linear-gradient(135deg,#0b1520,#162038);padding:22px 40px;display:flex;justify-content:space-between;align-items:flex-start}
.brand-name{font-family:'Cormorant Garamond',serif;font-size:22px;color:#fff;font-weight:400;letter-spacing:.4px}
.brand-tag{font-size:9px;color:#c9a84c;letter-spacing:.2em;text-transform:uppercase;margin-top:3px}
.inv-badge{text-align:right}
.inv-label{font-size:9px;color:rgba(255,255,255,.4);letter-spacing:.15em;text-transform:uppercase;margin-bottom:3px}
.inv-number{font-size:16px;font-weight:600;color:#c9a84c;letter-spacing:.05em}
.inv-date{font-size:10px;color:rgba(255,255,255,.4);margin-top:3px}
.gold-rule{height:1px;background:linear-gradient(90deg,#c9a84c,rgba(201,168,76,.1))}

.inv-title{background:#f8f5f0;padding:12px 40px;border-bottom:1px solid #ede8e0;display:flex;justify-content:space-between;align-items:center}
.inv-title-text{font-family:'Cormorant Garamond',serif;font-size:20px;color:#0b1520;font-weight:400}
.inv-status{font-size:9px;font-weight:600;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.1em;
  background:${balanceDue <= 0 ? '#dcfce7' : '#fef3c7'};
  color:${balanceDue <= 0 ? '#15803d' : '#92400e'};
  border:1px solid ${balanceDue <= 0 ? '#86efac' : '#fcd34d'}}

.parties{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:14px 40px;border-bottom:1px solid #f0ede8}
.party-box{padding-right:20px}
.party-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.15em;color:#c9a84c;font-weight:600;margin-bottom:6px}
.party-name{font-size:14px;font-weight:600;color:#0b1520;margin-bottom:2px}
.party-detail{font-size:11px;color:#6a6a7a;line-height:1.5}

.section{padding:12px 40px;border-bottom:1px solid #f0ede8}
.section-label{font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:#c9a84c;font-weight:600;margin-bottom:8px}
table{width:100%;border-collapse:collapse}
.th{background:linear-gradient(135deg,#0b1520,#162038);color:rgba(255,255,255,.7);font-size:8.5px;text-transform:uppercase;letter-spacing:.12em;padding:6px 10px;font-weight:500;text-align:left}
.th.r{text-align:right}
.th.c{text-align:center}
.td{padding:7px 10px;font-size:11px;color:#1a1a1a;border-bottom:1px solid #f0ede8}
.td.r{text-align:right}
.td.c{text-align:center}
.td.b{font-weight:600;color:#0b1520}

.totals-wrap{padding:12px 40px;border-bottom:1px solid #f0ede8}
.totals-inner{margin-left:auto;width:280px}
.totals-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
.totals-label{color:#4a4a5a}
.totals-value{font-weight:500;color:#1a1a1a}
.totals-discount{color:#16a34a}
.totals-sep{border-top:1.5px solid #c9a84c;margin:6px 0}
.totals-grand{display:flex;justify-content:space-between;padding:6px 0;font-size:16px;font-weight:700}
.totals-grand-label{color:#0b1520}
.totals-grand-value{color:#c9a84c}
.balance-box{margin-top:8px;padding:8px 12px;border-radius:7px;display:flex;justify-content:space-between;align-items:center;
  background:${balanceDue <= 0 ? '#f0fdf4' : '#fef3c7'};
  border:1px solid ${balanceDue <= 0 ? '#86efac' : '#fcd34d'}}
.balance-label{font-size:11px;font-weight:600;color:${balanceDue <= 0 ? '#15803d' : '#92400e'}}
.balance-value{font-size:16px;font-weight:700;color:${balanceDue <= 0 ? '#15803d' : '#92400e'}}

.footer{padding:12px 40px 14px;background:#f8f5f0}
.footer-row{display:flex;gap:0;border:1px solid #ede8e0;border-radius:8px;overflow:hidden}
.footer-cell{flex:1;padding:7px 12px;border-right:1px solid #ede8e0;background:#fff}
.footer-cell:last-child{border-right:none}
.footer-cell-label{font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:#8a8a9a;margin-bottom:2px}
.footer-cell-value{font-size:11px;color:#1a1a1a;font-weight:500}
.footer-address{font-size:10px;color:#6a6a7a;margin-top:8px}

.closing{padding:12px 40px 16px;text-align:center}
.closing-rule{height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.3) 30%,rgba(201,168,76,.3) 70%,transparent);margin-bottom:10px}
.closing-text{font-size:9px;color:#9a9aaa;line-height:1.65}
.closing-ref{display:inline-block;margin-top:6px;font-size:8.5px;font-weight:600;color:rgba(201,168,76,.65);letter-spacing:.15em;text-transform:uppercase;border-top:1px solid rgba(201,168,76,.2);padding-top:4px}

@media print{
  @page{size:A4;margin:0}
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
  <div class="inv-badge">
    <div class="inv-label">Tax Invoice</div>
    <div class="inv-number">${invoice.invoice_number}</div>
    <div class="inv-date">${today}</div>
  </div>
</div>
<div class="gold-rule"></div>

<div class="inv-title">
  <div class="inv-title-text">Event & Service Invoice</div>
  <div class="inv-status">${balanceDue <= 0 ? '✓ Fully Paid' : `Balance Due: ${inr(balanceDue)}`}</div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="party-label">Billed By</div>
    <div class="party-name">BookMySpaces</div>
    <div class="party-detail">
      Mukundapur, Near Ruby Hospital<br>
      EM Bypass, Kolkata<br>
      9051459463 · bookmyspaces.in
    </div>
  </div>
  <div class="party-box">
    <div class="party-label">Billed To</div>
    <div class="party-name">${proposal.client_name}</div>
    <div class="party-detail">
      ${proposal.client_phone || ''}${proposal.client_phone && proposal.client_email ? '<br>' : ''}
      ${proposal.client_email || ''}
    </div>
  </div>
</div>

<div class="section" style="padding-bottom:8px">
  <div class="section-label">Proposal Details</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
    <div style="background:#f8f5f0;border-radius:7px;padding:8px 10px;border-left:2px solid #c9a84c">
      <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:.12em;color:#8a8a9a;margin-bottom:2px">Proposal #</div>
      <div style="font-size:12px;font-weight:500">${proposal.proposal_number}</div>
    </div>
    <div style="background:#f8f5f0;border-radius:7px;padding:8px 10px;border-left:2px solid #c9a84c">
      <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:.12em;color:#8a8a9a;margin-bottom:2px">Event</div>
      <div style="font-size:12px;font-weight:500">${proposal.event_type || '—'}</div>
    </div>
    <div style="background:#f8f5f0;border-radius:7px;padding:8px 10px;border-left:2px solid #c9a84c">
      <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:.12em;color:#8a8a9a;margin-bottom:2px">Event Date</div>
      <div style="font-size:12px;font-weight:500">${fmtDate(proposal.event_date)}</div>
    </div>
  </div>
</div>

${hasEvent ? `
<div class="section">
  <div class="section-label">Event Package</div>
  <table>
    <thead>
      <tr>
        <th class="th">Description</th>
        <th class="th c">Details</th>
        <th class="th r">Rate</th>
        <th class="th r">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td">${proposal.package_name || 'Event Package'}</td>
        <td class="td c">${proposal.venue || '—'}</td>
        <td class="td r">—</td>
        <td class="td r b">${inr(basePrice)}</td>
      </tr>
      ${addonRowsHtml}
    </tbody>
  </table>
</div>` : ''}

${hasRooms ? `
<div class="section">
  <div class="section-label">Accommodation</div>
  <table>
    <thead>
      <tr>
        <th class="th">Room Type</th>
        <th class="th c">Qty × Nights</th>
        <th class="th r">Rate</th>
        <th class="th r">Amount</th>
      </tr>
    </thead>
    <tbody>${roomRowsHtml}</tbody>
  </table>
</div>` : ''}

<div class="totals-wrap">
  <div class="totals-inner">
    ${hasEvent && basePrice > 0 ? `<div class="totals-row"><span class="totals-label">Event Package</span><span class="totals-value">${inr(basePrice)}</span></div>` : ''}
    ${addonsTotal > 0 ? `<div class="totals-row"><span class="totals-label">Add-ons</span><span class="totals-value">${inr(addonsTotal)}</span></div>` : ''}
    ${hasRooms ? `<div class="totals-row"><span class="totals-label">Accommodation</span><span class="totals-value">${inr(roomsTotal)}</span></div>` : ''}
    ${discountAmt > 0 ? `<div class="totals-row"><span class="totals-label totals-discount">Discount</span><span class="totals-value totals-discount">− ${inr(discountAmt)}</span></div>` : ''}
    <div class="totals-sep"></div>
    <div class="totals-grand"><span class="totals-grand-label">Grand Total</span><span class="totals-grand-value">${inr(totalPrice)}</span></div>
    ${advancePaid > 0 ? `<div class="totals-row"><span class="totals-label" style="color:#15803d">Advance Received</span><span class="totals-value" style="color:#15803d">− ${inr(advancePaid)}</span></div>` : ''}
    <div class="balance-box">
      <div class="balance-label">${balanceDue <= 0 ? '✓ Fully Paid' : 'Balance Due'}</div>
      <div class="balance-value">${inr(balanceDue)}</div>
    </div>
  </div>
</div>

${payments.length > 0 ? `
<div class="section">
  <div class="section-label">Payment History</div>
  <table>
    <thead>
      <tr>
        <th class="th">Receipt #</th>
        <th class="th">Date</th>
        <th class="th">Mode</th>
        <th class="th r">Amount</th>
      </tr>
    </thead>
    <tbody>${paymentRowsHtml}</tbody>
  </table>
</div>` : ''}

<div class="footer">
  <div class="footer-row">
    <div class="footer-cell">
      <div class="footer-cell-label">WhatsApp / Call</div>
      <div class="footer-cell-value">9051459463</div>
    </div>
    <div class="footer-cell">
      <div class="footer-cell-label">UPI</div>
      <div class="footer-cell-value">9836014495@upi</div>
    </div>
    <div class="footer-cell">
      <div class="footer-cell-label">Website</div>
      <div class="footer-cell-value">bookmyspaces.in</div>
    </div>
  </div>
  <div class="footer-address">📍 Mukundapur, Near Ruby Hospital, EM Bypass, Kolkata</div>
</div>

<div class="closing">
  <div class="closing-rule"></div>
  <div class="closing-text">
    <strong style="color:#6a6a7a">Digitally Generated Invoice</strong><br>
    This document has been generated through the BookMySpaces system and is valid without a physical signature.
  </div>
  <div class="closing-ref">Invoice: ${invoice.invoice_number} · Proposal: ${proposal.proposal_number}</div>
</div>

</div>
</body>
</html>`
}

// ─── GET — generate invoice ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseAdmin()
  try {
    const { data: proposal, error: propErr } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', params.id)
      .single()

    if (propErr || !proposal) {
      return new NextResponse('Proposal not found', { status: 404 })
    }

    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('proposal_id', params.id)
      .order('payment_date', { ascending: true })

    const allPayments = payments ?? []
    const totalPaid   = allPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
    const balanceDue  = Math.max(0, Number(proposal.total_price || 0) - totalPaid)

    // Upsert invoice record (idempotent — same proposal always gets same invoice)
    const { data: existingInv } = await supabase
      .from('invoices')
      .select('*')
      .eq('proposal_id', params.id)
      .limit(1)
      .maybeSingle()

    let invoice = existingInv

    if (!invoice) {
      const { data: newInv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          proposal_id     : params.id,
          subtotal        : Number(proposal.total_price || 0) + Number(proposal.discount_amount || 0),
          discount_amount : Number(proposal.discount_amount || 0),
          tax_amount      : 0,
          total_amount    : Number(proposal.total_price || 0),
          advance_received: totalPaid,
          balance_due     : balanceDue,
          status          : balanceDue <= 0 ? 'paid' : 'sent',
        })
        .select('*')
        .single()

      if (invErr) throw invErr
      invoice = newInv
    } else {
      // Update advance/balance if already exists
      await supabase.from('invoices').update({
        advance_received: totalPaid,
        balance_due     : balanceDue,
        status          : balanceDue <= 0 ? 'paid' : 'sent',
      }).eq('id', invoice.id)
    }

    const html = buildInvoiceHTML(proposal, invoice, allPayments)
    const filename = `BookMySpaces-Invoice-${invoice.invoice_number}.pdf`

    return new NextResponse(html, {
      headers: {
        'Content-Type'       : 'text/html; charset=utf-8',
        'Content-Disposition': `filename="${filename}"`,
        'Cache-Control'      : 'no-store',
      },
    })
  } catch (err) {
    logger.error('invoice', 'GET failed', err)
    return new NextResponse(
      `Invoice generation failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    )
  }
}
