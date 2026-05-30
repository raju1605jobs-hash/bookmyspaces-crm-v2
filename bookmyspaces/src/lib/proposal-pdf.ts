// ═══════════════════════════════════════════════════════════════════════════════
// BOOKMYSPACES — PREMIUM PROPOSAL GENERATOR v2
// 2-page A4 · Navy + Gold · Luxury hospitality standard
// Compatible with existing DB schema — zero breaking changes
// ═══════════════════════════════════════════════════════════════════════════════

import { ProposalData } from './scoring'

// ─── Field normalisation (DB columns differ from ProposalData interface) ──────
function norm(proposal: any): {
  basePrice     : number
  totalPrice    : number
  advanceRequired: number
  packageName   : string
  venueName     : string
  discountAmt   : number
  discountReason: string
  taxPercent    : number
  taxAmount     : number
  addonsTotal   : number
} {
  const basePrice      = Number(proposal.base_price  ?? proposal.subtotal        ?? 0)
  const discountAmt    = Number(proposal.discount_amount ?? proposal.discount_value ?? 0)
  const taxPercent     = Number(proposal.tax_percent  ?? 18)
  const addons: any[]  = Array.isArray(proposal.addons) ? proposal.addons : []
  const addonsTotal    = addons.reduce((s: number, a: any) => s + Number(a.price ?? 0), 0)
  const taxable        = basePrice + addonsTotal - discountAmt
  const taxAmount      = Number(proposal.tax_amount  ?? (taxable * taxPercent / 100))
  const totalPrice     = Number(proposal.total_price ?? proposal.total_amount    ?? taxable + taxAmount)
  const advanceRequired= Number(proposal.advance_required ?? proposal.advance_amount ?? Math.round(totalPrice * 0.5))
  const packageName    = String(proposal.package_name ?? proposal.package ?? 'Standard')
  const venueName      = String(proposal.venue        ?? proposal.venue_name    ?? 'BookMySpaces')
  const discountReason = String(proposal.discount_reason ?? '')
  return { basePrice, totalPrice, advanceRequired, packageName, venueName, discountAmt, discountReason, taxPercent, taxAmount, addonsTotal }
}

function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN')
}

function fmtDate(d: string | null | undefined, fallback = ''): string {
  if (!d) return fallback
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return fallback }
}

function validUntil(createdAt?: string): string {
  const base = createdAt ? new Date(createdAt) : new Date()
  base.setDate(base.getDate() + 7)
  return base.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getDefaultInclusions(pkg: string): string[] {
  const p = pkg.toLowerCase()
  if (p.includes('platinum')) return [
    'Rooftop Venue (5 hrs)', 'Premium Theme Décor', 'Full Buffet Dinner',
    'DJ Music Setup', 'Party Lighting', 'Welcome Drinks', 'Cake Table + Stage',
    'Full Event Coordination', 'Photography Slot', 'Setup & Cleanup',
  ]
  if (p.includes('gold')) return [
    'Rooftop Venue (4 hrs)', 'Premium Decoration', 'Expanded Buffet',
    'Sound + Microphone', 'Party Lighting', 'Cake Table Setup',
    'Event Support Staff', 'Setup & Cleanup',
  ]
  if (p.includes('silver')) return [
    'Rooftop Venue (4 hrs)', 'Basic Decoration', 'Buffet Dinner',
    'Sound System', 'Basic Lighting', 'Event Staff', 'Setup & Cleanup',
  ]
  return [
    'Venue as per package', 'Decoration as agreed', 'Food & Beverages',
    'Sound & Lighting', 'Event Support Staff', 'Setup & Cleanup',
  ]
}

// ─── SVG QR placeholder (real QR generated client-side or replaced with image) ─
function qrSvg(upiId: string): string {
  // Minimal visual placeholder — replace with real QR in production
  return `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="80" height="80" rx="4" fill="#0f1923"/>
    <rect x="8" y="8" width="26" height="26" rx="2" fill="none" stroke="#c9a84c" stroke-width="2"/>
    <rect x="13" y="13" width="16" height="16" rx="1" fill="#c9a84c"/>
    <rect x="46" y="8" width="26" height="26" rx="2" fill="none" stroke="#c9a84c" stroke-width="2"/>
    <rect x="51" y="13" width="16" height="16" rx="1" fill="#c9a84c"/>
    <rect x="8" y="46" width="26" height="26" rx="2" fill="none" stroke="#c9a84c" stroke-width="2"/>
    <rect x="13" y="51" width="16" height="16" rx="1" fill="#c9a84c"/>
    <rect x="46" y="46" width="8" height="8" rx="1" fill="#c9a84c"/>
    <rect x="58" y="46" width="8" height="8" rx="1" fill="#c9a84c"/>
    <rect x="46" y="58" width="8" height="8" rx="1" fill="#c9a84c"/>
    <rect x="58" y="58" width="8" height="8" rx="1" fill="#c9a84c"/>
    <text x="40" y="76" font-size="5" fill="#c9a84c" text-anchor="middle" font-family="monospace">UPI</text>
  </svg>`
}

export function generateProposalHTML(
  proposal: ProposalData & { proposal_number?: string; ai_cover_note?: string; created_at?: string }
): string {

  const {
    basePrice, totalPrice, advanceRequired,
    packageName, venueName, discountAmt, discountReason,
    taxPercent, taxAmount, addonsTotal,
  } = norm(proposal)

  const inclusions  = proposal.inclusions ?? getDefaultInclusions(packageName)
  const addons: any[] = Array.isArray((proposal as any).addons) ? (proposal as any).addons : []
  const today       = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const validTill   = validUntil((proposal as any).created_at)
  const propNum     = (proposal as any).proposal_number ?? 'DRAFT'
  const balance     = totalPrice - advanceRequired
  const whatsappNum = '919051459463'
  const waMsg       = encodeURIComponent(
    `Hi, I'd like to confirm my booking for ${proposal.event_type} on ${proposal.event_date ?? 'the discussed date'}. Proposal #${propNum}. Please share payment details.`
  )

  // ── INCLUSIONS GRID (4 per row, compact icons) ────────────────────────────
  const ICONS: Record<string, string> = {
    venue: '🏛', decoration: '🌸', buffet: '🍽', dinner: '🍽', food: '🍽',
    sound: '🎵', music: '🎵', dj: '🎧', lighting: '💡', photography: '📸',
    photo: '📸', staff: '👥', coordination: '📋', coordinator: '📋',
    cake: '🎂', welcome: '🥂', drinks: '🥂', stage: '🎪', cleanup: '🧹',
    setup: '⚙️', microphone: '🎤', rooftop: '🌆', garden: '🌿',
  }
  function iconFor(item: string): string {
    const lower = item.toLowerCase()
    for (const [k, v] of Object.entries(ICONS)) {
      if (lower.includes(k)) return v
    }
    return '✓'
  }

  const inclusionChunks: string[][] = []
  for (let i = 0; i < inclusions.length; i += 4) {
    inclusionChunks.push(inclusions.slice(i, i + 4))
  }
  const inclusionsHtml = inclusionChunks.map(row =>
    `<tr>${row.map(item => `
      <td style="padding:6px 10px 6px 4px;vertical-align:top;white-space:nowrap">
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#1a2840;font-weight:500">
          <span style="font-size:14px">${iconFor(item)}</span>${item}
        </span>
      </td>`).join('')}
    </tr>`
  ).join('')

  // ── ADDONS ROWS ────────────────────────────────────────────────────────────
  const addonsHtml = addons.length > 0
    ? addons.map((a: any) => `
      <tr>
        <td style="padding:4px 0;color:#4a5568;font-size:12px">${a.name}</td>
        <td style="padding:4px 0;text-align:right;color:#1a2840;font-size:12px">${inr(Number(a.price ?? 0))}</td>
      </tr>`).join('')
    : ''

  // ── TRUST BADGES ──────────────────────────────────────────────────────────
  const trustBadges = [
    { icon: '🏆', label: '500+ Events Hosted' },
    { icon: '⭐', label: '4.9★ Guest Rating'  },
    { icon: '🔒', label: 'Secure Booking'     },
    { icon: '📞', label: '24/7 Support'       },
    { icon: '✨', label: 'Premium Venues'     },
  ]
  const trustHtml = trustBadges.map(b => `
    <td style="text-align:center;padding:0 12px">
      <div style="font-size:20px;margin-bottom:3px">${b.icon}</div>
      <div style="font-size:10px;color:#4a5568;font-weight:600;white-space:nowrap">${b.label}</div>
    </td>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposal ${propNum} — BookMySpaces</title>
<style>
/* ── Reset ───────────────────────────────────────────────────── */
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a2840;background:#fff;line-height:1.4}
a{color:inherit;text-decoration:none}

/* ── Page ────────────────────────────────────────────────────── */
.page{max-width:210mm;margin:0 auto;background:#fff}
.page-break{page-break-after:always;break-after:always}

/* ── Header strip ────────────────────────────────────────────── */
.hdr{
  background:linear-gradient(135deg,#0a1628 0%,#162240 60%,#1e3058 100%);
  padding:18px 36px;
  display:flex;justify-content:space-between;align-items:center
}
.hdr-brand{color:#fff}
.hdr-brand-name{font-size:22px;font-weight:300;letter-spacing:.5px}
.hdr-brand-tag{font-size:9px;color:#c9a84c;letter-spacing:.25em;text-transform:uppercase;margin-top:2px}
.hdr-meta{text-align:right}
.hdr-meta-num{font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.1em;margin-bottom:2px}
.hdr-meta-date{font-size:10px;color:rgba(255,255,255,.4)}
.hdr-status{
  display:inline-block;margin-top:5px;padding:2px 8px;border-radius:20px;
  font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  background:rgba(201,168,76,.2);color:#c9a84c;border:1px solid rgba(201,168,76,.4)
}

/* ── Gold rule ───────────────────────────────────────────────── */
.gold-rule{height:2px;background:linear-gradient(90deg,#c9a84c 0%,rgba(201,168,76,.2) 70%,transparent 100%)}

/* ── Hero band ───────────────────────────────────────────────── */
.hero{
  background:linear-gradient(180deg,#f7f3ee 0%,#fff 100%);
  padding:20px 36px 16px;
  border-bottom:1px solid #ede8e0
}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.hero-for{font-size:9px;color:#c9a84c;letter-spacing:.2em;text-transform:uppercase;margin-bottom:3px}
.hero-name{font-size:24px;font-weight:300;color:#0a1628;letter-spacing:.3px}
.hero-event{font-size:12px;color:#5a6a80;margin-top:2px}
.valid-badge{
  background:#fef3cd;border:1px solid #f0c040;border-radius:6px;
  padding:6px 12px;text-align:center
}
.valid-badge-label{font-size:9px;color:#856404;text-transform:uppercase;letter-spacing:.1em}
.valid-badge-date{font-size:12px;font-weight:700;color:#533f03;margin-top:1px}
.hero-note{
  font-size:12px;color:#3d4f63;line-height:1.55;
  padding:10px 14px;
  background:#fff;border-left:3px solid #c9a84c;border-radius:0 6px 6px 0;
  font-style:italic
}

/* ── 2-col snapshot ──────────────────────────────────────────── */
.snapshot{display:flex;gap:12px;padding:14px 36px;background:#fff}

/* Event details card */
.evt-card{
  flex:1.1;background:#f8f5f0;border-radius:10px;padding:14px 16px;
  border:1px solid #ede8e0
}
.evt-card-title{
  font-size:9px;letter-spacing:.2em;text-transform:uppercase;
  color:#c9a84c;font-weight:600;margin-bottom:10px
}
.evt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.evt-item-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#8a9aaa;margin-bottom:2px}
.evt-item-value{font-size:13px;font-weight:600;color:#0a1628}

/* Package highlight card */
.pkg-card{
  flex:1;
  background:linear-gradient(145deg,#0a1628,#162240);
  border-radius:10px;padding:14px 16px;color:#fff;
  display:flex;flex-direction:column;justify-content:space-between
}
.pkg-card-tier{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#c9a84c;margin-bottom:4px}
.pkg-card-name{font-size:20px;font-weight:300;margin-bottom:2px}
.pkg-card-price{font-size:28px;font-weight:700;color:#c9a84c;font-variant-numeric:tabular-nums}
.pkg-card-price-label{font-size:9px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.1em;margin-top:1px}
.pkg-inc-list{margin-top:10px;display:flex;flex-direction:column;gap:3px}
.pkg-inc-item{font-size:11px;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:5px}
.pkg-inc-dot{width:4px;height:4px;border-radius:50%;background:#c9a84c;flex-shrink:0}

/* ── Pricing table ───────────────────────────────────────────── */
.pricing-wrap{padding:0 36px 14px}
.pricing-inner{
  background:#f8f5f0;border-radius:10px;
  overflow:hidden;border:1px solid #ede8e0
}
.pricing-header{
  background:linear-gradient(135deg,#0a1628,#162240);
  padding:8px 16px;
  display:flex;justify-content:space-between;align-items:center
}
.pricing-header-label{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#c9a84c}
.pricing-header-sub{font-size:10px;color:rgba(255,255,255,.5)}
.pricing-table{width:100%;border-collapse:collapse;padding:0}
.pricing-table td{padding:5px 16px}
.pricing-table .row-label{font-size:12px;color:#4a5568}
.pricing-table .row-val{font-size:12px;color:#0a1628;text-align:right;font-weight:500}
.pricing-table .row-sep td{border-top:1px solid #ede8e0;padding-top:8px}
.pricing-table .row-discount .row-label{color:#16a34a}
.pricing-table .row-discount .row-val{color:#16a34a}
.pricing-total-row{
  background:linear-gradient(135deg,#0a1628,#162240);
  padding:10px 16px;
  display:flex;justify-content:space-between;align-items:center
}
.pricing-total-label{font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.1em}
.pricing-total-value{font-size:22px;font-weight:700;color:#c9a84c;font-variant-numeric:tabular-nums}
.pricing-advance-row{
  padding:8px 16px;background:#f0fdf4;
  display:flex;justify-content:space-between;align-items:center;
  border-top:1px solid #86efac
}
.pricing-advance-label{font-size:11px;color:#15803d;font-weight:600}
.pricing-advance-value{font-size:16px;font-weight:700;color:#15803d;font-variant-numeric:tabular-nums}
.pricing-balance-row{
  padding:6px 16px 8px;
  display:flex;justify-content:space-between;
  border-top:1px dashed #d1fae5
}
.pricing-balance-label{font-size:10px;color:#6b7280}
.pricing-balance-value{font-size:11px;color:#6b7280;font-weight:500}

/* ── Page 2 ──────────────────────────────────────────────────── */
.p2-hdr{
  background:linear-gradient(135deg,#0a1628,#162240);
  padding:12px 36px;
  display:flex;justify-content:space-between;align-items:center
}
.p2-hdr-left{font-size:11px;color:rgba(255,255,255,.5)}
.p2-hdr-right{font-size:11px;color:#c9a84c;font-weight:600}

.section{padding:14px 36px}
.section-title{
  font-size:9px;letter-spacing:.2em;text-transform:uppercase;
  color:#c9a84c;font-weight:700;margin-bottom:10px;
  display:flex;align-items:center;gap:8px
}
.section-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#ede8e0,transparent)}

/* Inclusions */
.inc-table{width:100%;border-collapse:collapse}

/* Special requirements */
.req-box{
  background:#fff8e8;border:1px solid rgba(201,168,76,.3);
  border-radius:8px;padding:10px 14px;font-size:12px;color:#3d4f63;line-height:1.5
}

/* Trust strip */
.trust-table{width:100%;border-collapse:collapse}
.trust-wrap{
  background:linear-gradient(135deg,#0a1628,#162240);
  border-radius:10px;overflow:hidden;padding:14px 0
}

/* Payment block */
.pay-grid{display:flex;gap:14px;align-items:flex-start}
.pay-qr-box{
  background:#0a1628;border-radius:10px;padding:10px;
  display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0
}
.pay-qr-label{font-size:9px;color:#c9a84c;letter-spacing:.1em;text-transform:uppercase}
.pay-details{flex:1}
.pay-upi{
  background:#f8f5f0;border:1px solid #ede8e0;border-radius:8px;
  padding:8px 14px;margin-bottom:10px
}
.pay-upi-label{font-size:9px;color:#8a9aaa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}
.pay-upi-value{font-size:15px;font-weight:700;color:#0a1628;letter-spacing:.05em}
.pay-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pay-meta-item{background:#f8f5f0;border-radius:8px;padding:8px 12px;border:1px solid #ede8e0}
.pay-meta-label{font-size:9px;color:#8a9aaa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}
.pay-meta-value{font-size:12px;font-weight:600;color:#0a1628}
.pay-meta-sub{font-size:10px;color:#6b7280;margin-top:1px}

/* CTA */
.cta-band{
  background:linear-gradient(135deg,#0a1628 0%,#162240 60%,#1e3058 100%);
  padding:20px 36px;
  text-align:center
}
.cta-headline{font-size:20px;font-weight:300;color:#fff;letter-spacing:.3px;margin-bottom:4px}
.cta-sub{font-size:11px;color:rgba(255,255,255,.5);margin-bottom:16px}
.cta-btns{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.btn-wa{
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 20px;border-radius:8px;font-size:12px;font-weight:700;
  background:#25D366;color:#fff;text-decoration:none
}
.btn-call{
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 20px;border-radius:8px;font-size:12px;font-weight:700;
  background:rgba(201,168,76,.15);color:#c9a84c;
  border:1px solid rgba(201,168,76,.4);text-decoration:none
}
.btn-email{
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 20px;border-radius:8px;font-size:12px;font-weight:700;
  background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);
  border:1px solid rgba(255,255,255,.15);text-decoration:none
}
.cta-footer{margin-top:14px;font-size:10px;color:rgba(255,255,255,.3);line-height:1.6}

/* ── Print ───────────────────────────────────────────────────── */
@media print{
  @page{size:A4;margin:0}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{overflow:visible!important}
  .no-print{display:none!important}
  .page-break{page-break-after:always;break-after:always}
}
</style>
</head>
<body>
<div class="page">

<!-- ════════════════════════════════════════════════════════════
     PAGE 1 — EXECUTIVE SALES PAGE
     ════════════════════════════════════════════════════════════ -->

<!-- Header strip -->
<div class="hdr">
  <div class="hdr-brand">
    <div class="hdr-brand-name">BookMySpaces</div>
    <div class="hdr-brand-tag">Premium Hospitality · Kolkata</div>
  </div>
  <div class="hdr-meta">
    <div class="hdr-meta-num">Proposal #${propNum}</div>
    <div class="hdr-meta-date">Prepared: ${today}</div>
    <div class="hdr-status">Awaiting Confirmation</div>
  </div>
</div>
<div class="gold-rule"></div>

<!-- Hero band -->
<div class="hero">
  <div class="hero-top">
    <div>
      <div class="hero-for">Prepared Exclusively For</div>
      <div class="hero-name">${proposal.client_name}</div>
      <div class="hero-event">${proposal.event_type}${proposal.event_date ? ' · ' + fmtDate(proposal.event_date) : ''}</div>
    </div>
    <div class="valid-badge">
      <div class="valid-badge-label">Valid Until</div>
      <div class="valid-badge-date">${validTill}</div>
    </div>
  </div>
  ${proposal.ai_cover_note ? `
  <div class="hero-note">${
    // Truncate to 2 lines max (~200 chars) for space efficiency
    proposal.ai_cover_note.length > 220
      ? proposal.ai_cover_note.substring(0, 217) + '…'
      : proposal.ai_cover_note
  }</div>` : ''}
</div>

<!-- 2-col snapshot: Event Details + Package Card -->
<div class="snapshot">

  <!-- Event details -->
  <div class="evt-card">
    <div class="evt-card-title">Event Details</div>
    <div class="evt-grid">
      <div>
        <div class="evt-item-label">Event</div>
        <div class="evt-item-value">${proposal.event_type}</div>
      </div>
      <div>
        <div class="evt-item-label">Date</div>
        <div class="evt-item-value">${fmtDate(proposal.event_date, 'TBD')}</div>
      </div>
      ${(proposal as any).event_time ? `
      <div>
        <div class="evt-item-label">Time</div>
        <div class="evt-item-value">${(proposal as any).event_time}</div>
      </div>` : ''}
      <div>
        <div class="evt-item-label">Guests</div>
        <div class="evt-item-value">${proposal.guest_count ? proposal.guest_count + ' pax' : 'TBD'}</div>
      </div>
      <div>
        <div class="evt-item-label">Venue</div>
        <div class="evt-item-value">${venueName}</div>
      </div>
      ${proposal.client_phone ? `
      <div>
        <div class="evt-item-label">Contact</div>
        <div class="evt-item-value">${proposal.client_phone}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- Package highlight -->
  <div class="pkg-card">
    <div>
      <div class="pkg-card-tier">Selected Package</div>
      <div class="pkg-card-name">${packageName}</div>
      <div class="pkg-card-price">${inr(basePrice)}</div>
      <div class="pkg-card-price-label">Base Package Value</div>
    </div>
    <div class="pkg-inc-list">
      ${inclusions.slice(0, 5).map(i =>
        `<div class="pkg-inc-item"><span class="pkg-inc-dot"></span>${i}</div>`
      ).join('')}
      ${inclusions.length > 5 ? `<div class="pkg-inc-item"><span class="pkg-inc-dot"></span>+${inclusions.length - 5} more inclusions</div>` : ''}
    </div>
  </div>

</div>

<!-- Pricing table -->
<div class="pricing-wrap">
  <div class="pricing-inner">
    <div class="pricing-header">
      <div class="pricing-header-label">Pricing Breakdown</div>
      <div class="pricing-header-sub">All amounts in Indian Rupees</div>
    </div>
    <table class="pricing-table">
      <tr>
        <td class="row-label">${packageName} Package</td>
        <td class="row-val">${inr(basePrice)}</td>
      </tr>
      ${addonsHtml}
      ${addonsTotal > 0 ? `
      <tr class="row-sep">
        <td class="row-label" style="color:#6b7280;font-size:11px">Add-ons Subtotal</td>
        <td class="row-val" style="font-size:11px;color:#6b7280">${inr(addonsTotal)}</td>
      </tr>` : ''}
      ${discountAmt > 0 ? `
      <tr class="${addonsTotal > 0 ? '' : 'row-sep'} row-discount">
        <td class="row-label">Discount${discountReason ? ' (' + discountReason + ')' : ''}</td>
        <td class="row-val">− ${inr(discountAmt)}</td>
      </tr>` : ''}
      <tr class="row-sep">
        <td class="row-label" style="color:#6b7280;font-size:11px">GST (${taxPercent}%)</td>
        <td class="row-val" style="font-size:11px;color:#6b7280">${inr(taxAmount)}</td>
      </tr>
    </table>
    <div class="pricing-total-row">
      <div class="pricing-total-label">Grand Total</div>
      <div class="pricing-total-value">${inr(totalPrice)}</div>
    </div>
    <div class="pricing-advance-row">
      <div>
        <div class="pricing-advance-label">⚡ Advance to Confirm Booking</div>
        <div style="font-size:10px;color:#16a34a;margin-top:1px">Secures your date immediately</div>
      </div>
      <div class="pricing-advance-value">${inr(advanceRequired)}</div>
    </div>
    <div class="pricing-balance-row">
      <div class="pricing-balance-label">Balance due on event day</div>
      <div class="pricing-balance-value">${inr(balance)}</div>
    </div>
  </div>
</div>

<!-- PAGE BREAK -->
<div class="page-break"></div>

<!-- ════════════════════════════════════════════════════════════
     PAGE 2 — DECISION PAGE
     ════════════════════════════════════════════════════════════ -->

<!-- Page 2 mini-header -->
<div class="p2-hdr">
  <div class="p2-hdr-left">${proposal.client_name} · Proposal #${propNum}</div>
  <div class="p2-hdr-right">${packageName} Package · ${inr(totalPrice)}</div>
</div>
<div class="gold-rule"></div>

<!-- Section 1: Inclusions grid -->
<div class="section">
  <div class="section-title">What's Included</div>
  <table class="inc-table">
    ${inclusionsHtml}
  </table>
</div>

<!-- Section 2: Special requirements (conditional) -->
${proposal.special_requirements ? `
<div class="section" style="padding-top:0">
  <div class="section-title">Special Requirements Noted</div>
  <div class="req-box">${proposal.special_requirements}</div>
</div>` : ''}

<!-- Section 3: Trust strip -->
<div class="section" style="padding-top:0">
  <div class="section-title">Why BookMySpaces</div>
  <div class="trust-wrap">
    <table class="trust-table">
      <tr>${trustHtml}</tr>
    </table>
  </div>
</div>

<!-- Section 4: Payment & confirmation -->
<div class="section" style="padding-top:0">
  <div class="section-title">Payment & Confirmation</div>
  <div class="pay-grid">
    <div class="pay-qr-box">
      ${qrSvg('9051459463@paytm')}
      <div class="pay-qr-label">Scan to Pay</div>
    </div>
    <div class="pay-details">
      <div class="pay-upi">
        <div class="pay-upi-label">UPI ID</div>
        <div class="pay-upi-value">9051459463@paytm</div>
      </div>
      <div class="pay-meta-grid">
        <div class="pay-meta-item">
          <div class="pay-meta-label">Advance Required</div>
          <div class="pay-meta-value">${inr(advanceRequired)}</div>
          <div class="pay-meta-sub">To confirm booking</div>
        </div>
        <div class="pay-meta-item">
          <div class="pay-meta-label">Proposal Valid Until</div>
          <div class="pay-meta-value">${validTill}</div>
          <div class="pay-meta-sub">Date subject to availability</div>
        </div>
        <div class="pay-meta-item">
          <div class="pay-meta-label">WhatsApp / Call</div>
          <div class="pay-meta-value">+91 90514 59463</div>
          <div class="pay-meta-sub">Instant response</div>
        </div>
        <div class="pay-meta-item">
          <div class="pay-meta-label">Cancellation</div>
          <div class="pay-meta-value">7-day full refund</div>
          <div class="pay-meta-sub">T&C apply</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Section 5: CTA band -->
<div class="cta-band">
  <div class="cta-headline">Ready to Confirm Your Event?</div>
  <div class="cta-sub">Reply to this proposal or contact us directly — we respond within minutes.</div>
  <div class="cta-btns">
    <a href="https://wa.me/${whatsappNum}?text=${waMsg}" class="btn-wa">
      💬 Confirm via WhatsApp
    </a>
    <a href="tel:+919051459463" class="btn-call">
      📞 Call Us
    </a>
    <a href="mailto:homestay.book992@gmail.com?subject=Confirm Booking — Proposal ${propNum}" class="btn-email">
      ✉ Email Us
    </a>
  </div>
  <div class="cta-footer">
    BookMySpaces · Mukundapur, Near Ruby Hospital, EM Bypass, Kolkata<br>
    This proposal is valid for 7 days. Slot is confirmed only upon advance payment receipt.
  </div>
</div>

</div><!-- .page -->
</body>
</html>`
}
