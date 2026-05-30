// ═══════════════════════════════════════════════════════════════════════════════
// BOOKMYSPACES — PROPOSAL PDF GENERATOR v3
// 2-page A4 · Navy + Gold · 10/10 luxury hospitality standard
// ═══════════════════════════════════════════════════════════════════════════════

import { ProposalData } from './scoring'

// ─── Room price helper ────────────────────────────────────────────────────────

function getLowestRoomPrice(proposal: any): { price: number | null; label: string } {
  const rooms: any[] =
    Array.isArray(proposal.rooms)        ? proposal.rooms        :
    Array.isArray(proposal.room_types)   ? proposal.room_types   :
    Array.isArray(proposal.stay_options) ? proposal.stay_options :
    []

  if (rooms.length === 0) return { price: null, label: 'from ₹2,500 / night' }

  const prices = rooms
    .map((r: any) => Number(r.price ?? r.base_price ?? r.rate ?? 0))
    .filter((p: number) => p > 0)

  if (prices.length === 0) return { price: null, label: 'from ₹2,500 / night' }

  const lowest = Math.min(...prices)
  return { price: lowest, label: `from ₹${lowest.toLocaleString('en-IN')} / night` }
}

// ─── Cover note sanitiser ─────────────────────────────────────────────────────
// Strips markdown headers, bold, bullets, excess blank lines.
// Caps at 4 lines. Falls back to a professionally written note if the
// AI output is too long, empty, or full of raw formatting.

function sanitiseCoverNote(raw: string | null | undefined, clientName: string, eventType: string): string {
  if (!raw || raw.trim().length < 10) {
    return buildFallbackNote(clientName, eventType)
  }

  // Strip common markdown artifacts
  let clean = raw
    .replace(/#{1,6}\s+/g, '')          // ## headings
    .replace(/\*\*(.*?)\*\*/g, '$1')    // **bold**
    .replace(/\*(.*?)\*/g, '$1')        // *italic*
    .replace(/^[-*•]\s+/gm, '')         // bullet points
    .replace(/^_{1,3}|_{1,3}$/gm, '')   // underscores
    .replace(/`[^`]*`/g, '')            // inline code
    .replace(/\n{3,}/g, '\n\n')         // excess blank lines
    .trim()

  // Detect if it still looks like a structured AI doc (all-caps lines, numbered sections)
  const hasMarkdownPatterns = /^[A-Z\s]{8,}$|^\d+\.\s|CLIENT:|EVENT DATE:/m.test(clean)
  if (hasMarkdownPatterns) {
    return buildFallbackNote(clientName, eventType)
  }

  // Cap at 4 lines (~320 chars) for space budget
  const lines = clean.split('\n').filter(l => l.trim().length > 0).slice(0, 4)
  return lines.join('\n')
}

function buildFallbackNote(clientName: string, eventType: string): string {
  const firstName = (clientName || 'Valued Guest').split(' ')[0]
  const event = eventType || 'your special occasion'
  return `Dear ${firstName},\n\nWe are delighted to present a carefully curated ${event.toLowerCase()} experience designed exclusively for you. Our team looks forward to creating an unforgettable occasion with exceptional hospitality and personalised service.\n\nWarm regards,\nBookMySpaces Hospitality Team`
}

// ─── Default inclusions ───────────────────────────────────────────────────────

function getDefaultInclusions(packageName: string): string[] {
  const pkg = packageName.toLowerCase()

  if (pkg.includes('platinum')) return [
    'Rooftop venue (5 hours)', 'Premium theme decoration', 'Full buffet dinner',
    'DJ music setup', 'Party lighting setup', 'Welcome drinks for all guests',
    'Cake table + stage setup', 'Full event coordination', 'Setup & cleanup',
  ]

  if (pkg.includes('gold')) return [
    'Rooftop venue (4 hours)', 'Premium decoration setup', 'Buffet dinner (expanded menu)',
    'Sound system + microphone', 'Party lighting setup', 'Cake table setup',
    'Event support staff', 'Setup & cleanup',
  ]

  if (pkg.includes('silver')) return [
    'Rooftop venue (4 hours)', 'Basic decoration setup', 'Buffet dinner (veg + non-veg)',
    'Sound system & music', 'Basic lighting arrangement', 'Event support staff', 'Setup & cleanup',
  ]

  return [
    'Venue as per package', 'Decoration as agreed', 'Food & beverages as per plan',
    'Sound & lighting', 'Event support staff', 'Setup & cleanup',
  ]
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateProposalHTML(
  proposal: ProposalData & { proposal_number?: string; ai_cover_note?: string }
): string {

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // ── Field normalisation (DB columns vs ProposalData interface) ────────────
  const basePrice: number =
    (proposal as any).base_price ?? (proposal as any).subtotal ?? 0

  const totalPrice: number =
    (proposal as any).total_price ?? (proposal as any).total_amount ?? 0

  const advanceRequired: number =
    (proposal as any).advance_required ??
    (proposal as any).advance_amount ??
    Math.round(totalPrice * 0.5)

  const packageName: string =
    (proposal as any).package_name ?? (proposal as any).package ?? 'Standard'

  const venueName: string =
    (proposal as any).venue ?? (proposal as any).venue_name ?? 'BookMySpaces'

  // ── Cover note (sanitised — no markdown ever reaches the PDF) ─────────────
  const coverNote = sanitiseCoverNote(
    (proposal as any).ai_cover_note,
    proposal.client_name,
    proposal.event_type
  )

  // ── Addons ────────────────────────────────────────────────────────────────
  const addonsRows = proposal.addons?.length
    ? proposal.addons.map(a => `
      <tr>
        <td style="padding:5px 0;color:#4a4a5a;font-size:12px">${a.name}</td>
        <td style="padding:5px 0;text-align:right;color:#1a1a1a;font-size:12px">₹${a.price.toLocaleString('en-IN')}</td>
      </tr>`).join('')
    : ''

  // ── Discount row ──────────────────────────────────────────────────────────
  const discountRow = proposal.discount_amount && proposal.discount_amount > 0
    ? `<tr>
        <td style="padding:5px 0;color:#16a34a;font-size:12px">Discount${proposal.discount_reason ? ` (${proposal.discount_reason})` : ''}</td>
        <td style="padding:5px 0;text-align:right;color:#16a34a;font-size:12px">− ₹${proposal.discount_amount.toLocaleString('en-IN')}</td>
      </tr>`
    : ''

  // ── Inclusions ────────────────────────────────────────────────────────────
  const inclusionsList = (proposal.inclusions || getDefaultInclusions(packageName))
    .map(inc => `<li>${inc}</li>`)
    .join('')

  // ── Enhancement items ─────────────────────────────────────────────────────
  const { label: roomLabel } = getLowestRoomPrice(proposal)
  const enhItems: Array<{ icon: string; name: string; price: string; gold: boolean }> = [
    { icon: '🛏', name: 'Guest Room Accommodation',     price: roomLabel,                   gold: true  },
    { icon: '🌸', name: 'Event Decoration Setup',       price: 'Customised for your event', gold: false },
    { icon: '🎧', name: 'DJ & Music Arrangements',      price: 'Available on request',      gold: false },
    { icon: '🎸', name: 'Live / Acoustic Performances', price: 'Available on request',      gold: false },
    { icon: '🍽', name: 'Food & Catering Options',      price: 'Customised for your event', gold: false },
    { icon: '✨', name: 'Custom Celebration Packages',  price: 'Speak with our team',       gold: false },
  ]
  const enhItemsHtml = enhItems.map(item => `
    <div class="enh-item">
      <span class="enh-item-icon">${item.icon}</span>
      <div>
        <div class="enh-item-name">${item.name}</div>
        <div class="enh-item-price${item.gold ? ' gold' : ''}">${item.price}</div>
      </div>
    </div>`).join('')

  // ── First name for header ─────────────────────────────────────────────────
  const firstName = (proposal.client_name || '').split(' ')[0] || proposal.client_name

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposal ${(proposal as any).proposal_number || ''} — BookMySpaces</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

/* ── Reset ───────────────────────────────────── */
* { margin:0; padding:0; box-sizing:border-box }
body {
  font-family:'DM Sans',system-ui,sans-serif;
  color:#1a1a1a; background:#fff;
  font-size:12px; line-height:1.45;
}
.page { max-width:800px; margin:0 auto }

/* ── Header ──────────────────────────────────── */
.header {
  background:linear-gradient(135deg,#0b1520 0%,#162038 100%);
  padding:20px 40px 18px;
  position:relative; overflow:hidden;
}
.header::before {
  content:''; position:absolute;
  top:-50px; right:-50px;
  width:160px; height:160px; border-radius:50%;
  background:rgba(201,168,76,0.07);
}
.header-top {
  display:flex; justify-content:space-between;
  align-items:flex-start; margin-bottom:14px;
}
.brand-name {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:22px; color:#fff; font-weight:400; letter-spacing:.4px;
}
.brand-tag {
  font-size:9px; color:#c9a84c;
  letter-spacing:.22em; text-transform:uppercase; margin-top:3px;
}
.proposal-meta { text-align:right }
.proposal-number { font-size:11px; color:rgba(255,255,255,.45); letter-spacing:.08em }
.proposal-date   { font-size:10px; color:rgba(255,255,255,.35); margin-top:3px }

/* Client name as hero focal point */
.header-for {
  font-size:9px; letter-spacing:.22em; text-transform:uppercase;
  color:rgba(201,168,76,.65); margin-bottom:4px;
}
.header-client-name {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:36px; font-weight:300; color:#fff;
  letter-spacing:.4px; line-height:1.1;
}
.header-event-line {
  font-size:11px; color:rgba(201,168,76,.8);
  letter-spacing:.14em; text-transform:uppercase; margin-top:5px;
}

/* ── Gold rule ───────────────────────────────── */
.gold-rule {
  height:1px;
  background:linear-gradient(90deg,#c9a84c 0%,rgba(201,168,76,.15) 70%,transparent 100%);
}

/* ── Sections ────────────────────────────────── */
.section { padding:14px 40px; border-bottom:1px solid #f0ede8 }
.section-label {
  font-size:8.5px; letter-spacing:.22em; text-transform:uppercase;
  color:#c9a84c; font-weight:600; margin-bottom:9px;
}

/* ── Cover note ──────────────────────────────── */
.cover-note {
  font-size:12px; color:#2c2c2c; line-height:1.65;
  font-style:italic; white-space:pre-line;
  padding:10px 14px; border-left:2px solid #c9a84c;
  background:#fdfaf6; border-radius:0 6px 6px 0;
}

/* ── Event details ───────────────────────────── */
.details-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px }
.detail-item {
  background:#f8f5f0; border-radius:7px;
  padding:8px 10px; border-left:2px solid #c9a84c;
}
.detail-label { font-size:8.5px; text-transform:uppercase; letter-spacing:.14em; color:#8a8a9a; margin-bottom:2px }
.detail-value  { font-size:12px; color:#1a1a1a; font-weight:500 }

/* ── Package + pricing layout ────────────────── */
.pkg-pricing-row { display:flex; gap:14px; align-items:flex-start; padding:14px 40px }

.package-card {
  flex:1;
  background:linear-gradient(145deg,#0b1520,#162038);
  border-radius:10px; padding:16px 18px; color:#fff;
}
.package-tier {
  font-size:8.5px; letter-spacing:.22em; text-transform:uppercase;
  color:#c9a84c; margin-bottom:5px;
}
.package-name {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:22px; font-weight:400;
}
.package-price {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:26px; font-weight:600; color:#c9a84c; margin-top:4px;
}

.pricing-wrap { flex:1.1 }
.pricing-table { width:100%; border-collapse:collapse }
.pricing-table td { padding:4px 0; font-size:12px }
.pricing-table .lbl { color:#4a4a5a }
.pricing-table .val { text-align:right; color:#1a1a1a; font-weight:500 }
.total-row td {
  padding:8px 0 4px; font-size:16px; font-weight:600; color:#1a1a1a;
  border-top:1.5px solid #c9a84c;
}
.advance-box {
  background:#f0fdf4; border:1px solid #86efac; border-radius:7px;
  padding:7px 12px; margin-top:8px;
  display:flex; justify-content:space-between; align-items:center;
}
.advance-label { color:#16a34a; font-size:11px }
.advance-amount { color:#16a34a; font-size:17px; font-weight:600 }

/* ── Inclusions ──────────────────────────────── */
.inclusions-list { list-style:none; columns:4; gap:8px }
.inclusions-list li {
  font-size:11px; color:#3a3a4a; padding:2px 0; line-height:1.4;
  break-inside:avoid;
}
.inclusions-list li::before { content:'✔ '; color:#c9a84c; font-weight:600 }

/* Special requirements */
.req-box {
  margin-top:10px; padding:9px 12px;
  background:#fff8e8; border-radius:7px;
  border:1px solid rgba(201,168,76,.25);
  font-size:11px; color:#4a4a5a; line-height:1.5;
}

/* ── Enhancement section ─────────────────────── */
.enh-wrap {
  margin:0 40px 10px;
  border-radius:9px; overflow:hidden;
  border:1px solid rgba(201,168,76,.28);
}
.enh-header {
  background:linear-gradient(135deg,#0b1520,#162038);
  padding:8px 16px;
  display:flex; align-items:center; justify-content:space-between;
}
.enh-header-left { display:flex; align-items:center; gap:9px }
.enh-header-icon { font-size:14px; line-height:1 }
.enh-header-label {
  font-size:8px; letter-spacing:.2em; text-transform:uppercase;
  color:#c9a84c; font-weight:600; margin-bottom:1px;
}
.enh-header-title { font-size:12px; color:#fff; font-weight:300 }
.enh-header-right { font-size:9px; color:rgba(255,255,255,.3); text-align:right; line-height:1.4 }
.enh-body { background:linear-gradient(180deg,#f8f5f0,#fff); padding:8px 16px }
.enh-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px }
.enh-item {
  display:flex; align-items:flex-start; gap:6px;
  padding:6px 8px; background:#fff;
  border-radius:6px; border:1px solid #ede8e0;
}
.enh-item-icon { font-size:12px; flex-shrink:0; line-height:1.2; margin-top:1px }
.enh-item-name  { font-size:10px; font-weight:600; color:#0b1520; margin-bottom:1px }
.enh-item-price { font-size:9px; color:#8a9aaa }
.enh-item-price.gold { color:#a07830; font-weight:600 }
.enh-footer {
  background:rgba(201,168,76,.05); border-top:1px solid rgba(201,168,76,.14);
  padding:5px 16px;
  display:flex; align-items:center; justify-content:space-between;
}
.enh-footer-text { font-size:9px; color:#5a6a80; line-height:1.4 }
.enh-footer-cta {
  font-size:9px; font-weight:700; color:#a07830; white-space:nowrap;
  border:1px solid rgba(201,168,76,.28); padding:2px 9px;
  border-radius:20px; background:rgba(201,168,76,.07);
}

/* ── Footer ──────────────────────────────────── */
.footer { padding:12px 40px 16px; background:#f8f5f0 }
.footer-cta {
  font-family:'Cormorant Garamond',Georgia,serif;
  font-size:17px; color:#1a1a1a; margin-bottom:9px;
}
.contact-row {
  display:flex; gap:0; flex-wrap:wrap;
  margin-bottom:8px; border:1px solid #ede8e0;
  border-radius:8px; overflow:hidden;
}
.contact-cell {
  flex:1; padding:7px 12px;
  border-right:1px solid #ede8e0; background:#fff;
}
.contact-cell:last-child { border-right:none }
.contact-cell-label {
  font-size:8px; text-transform:uppercase; letter-spacing:.14em;
  color:#8a8a9a; margin-bottom:2px;
}
.contact-cell-value { font-size:11px; color:#1a1a1a; font-weight:500 }
.footer-address { font-size:10px; color:#6a6a7a; margin-bottom:6px }
.validity-note {
  font-size:9.5px; color:#8a8a9a; line-height:1.5;
  border-top:1px solid #e8e4de; padding-top:7px; margin-top:0;
}

/* ── Closing strip ───────────────────────────── */
.closing-strip {
  padding:14px 40px 18px;
  text-align:center;
}
.closing-rule {
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(201,168,76,.3) 30%,rgba(201,168,76,.3) 70%,transparent);
  margin-bottom:12px;
}
.closing-text {
  font-size:9.5px; color:#9a9aaa; line-height:1.7;
  letter-spacing:.01em;
}
.closing-ref {
  display:inline-block; margin-top:6px;
  font-size:9px; font-weight:600;
  color:rgba(201,168,76,.7);
  letter-spacing:.18em; text-transform:uppercase;
  border-top:1px solid rgba(201,168,76,.2);
  padding-top:5px;
}

/* ── Print ───────────────────────────────────── */
@media print {
  @page { size:A4; margin:0 }
  * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important }
  body { overflow:visible!important }
  .no-print { display:none!important }
}
</style>
</head>
<body>
<div class="page">

<!-- ═══ HEADER ═══ -->
<div class="header">
  <div class="header-top">
    <div>
      <div class="brand-name">BookMySpaces</div>
      <div class="brand-tag">Premium Hospitality · Kolkata</div>
    </div>
    <div class="proposal-meta">
      <div class="proposal-number">Proposal #${(proposal as any).proposal_number || 'DRAFT'}</div>
      <div class="proposal-date">${today}</div>
    </div>
  </div>
  <div class="header-for">Prepared Exclusively For</div>
  <div class="header-client-name">${proposal.client_name}</div>
  <div class="header-event-line">${proposal.event_type}${proposal.event_date ? ' · ' + new Date(proposal.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</div>
</div>
<div class="gold-rule"></div>

<!-- ═══ COVER NOTE ═══ -->
<div class="section">
  <div class="section-label">A Personal Note</div>
  <div class="cover-note">${coverNote}</div>
</div>

<!-- ═══ EVENT DETAILS ═══ -->
<div class="section">
  <div class="section-label">Event Details</div>
  <div class="details-grid">
    <div class="detail-item">
      <div class="detail-label">Client</div>
      <div class="detail-value">${proposal.client_name}</div>
    </div>
    ${proposal.client_phone ? `
    <div class="detail-item">
      <div class="detail-label">Contact</div>
      <div class="detail-value">${proposal.client_phone}</div>
    </div>` : ''}
    <div class="detail-item">
      <div class="detail-label">Event Type</div>
      <div class="detail-value">${proposal.event_type}</div>
    </div>
    ${proposal.event_date ? `
    <div class="detail-item">
      <div class="detail-label">Date</div>
      <div class="detail-value">${new Date(proposal.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>` : ''}
    ${(proposal as any).event_time ? `
    <div class="detail-item">
      <div class="detail-label">Time</div>
      <div class="detail-value">${(proposal as any).event_time}</div>
    </div>` : ''}
    ${proposal.guest_count ? `
    <div class="detail-item">
      <div class="detail-label">Guests</div>
      <div class="detail-value">${proposal.guest_count} Guests</div>
    </div>` : ''}
    <div class="detail-item">
      <div class="detail-label">Venue</div>
      <div class="detail-value">${venueName}</div>
    </div>
  </div>
</div>

<!-- ═══ PACKAGE + PRICING (side by side) ═══ -->
<div class="pkg-pricing-row">

  <div class="package-card">
    <div class="package-tier">BookMySpaces · ${venueName}</div>
    <div class="package-name">${packageName} Package</div>
    <div class="package-price">₹${basePrice.toLocaleString('en-IN')}</div>
  </div>

  <div class="pricing-wrap">
    <table class="pricing-table">
      <tr>
        <td class="lbl">${packageName} Package</td>
        <td class="val">₹${basePrice.toLocaleString('en-IN')}</td>
      </tr>
      ${addonsRows}
      ${discountRow}
      <tr class="total-row">
        <td>Total Amount</td>
        <td style="text-align:right;color:#c9a84c">₹${totalPrice.toLocaleString('en-IN')}</td>
      </tr>
    </table>
    <div class="advance-box">
      <div>
        <div class="advance-label" style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:600">Advance to Confirm</div>
        <div style="font-size:9px;color:#16a34a;margin-top:1px">Balance due on event day</div>
      </div>
      <div class="advance-amount">₹${advanceRequired.toLocaleString('en-IN')}</div>
    </div>
  </div>

</div>

<!-- ═══ INCLUSIONS ═══ -->
<div class="section">
  <div class="section-label">What's Included</div>
  <ul class="inclusions-list">${inclusionsList}</ul>
  ${proposal.special_requirements ? `
  <div class="req-box">
    <span style="font-size:8.5px;text-transform:uppercase;letter-spacing:.14em;color:#c9a84c;font-weight:600">Special Requirements · </span>${proposal.special_requirements}
  </div>` : ''}
</div>

<!-- ═══ ENHANCE YOUR CELEBRATION ═══ -->
<div class="enh-wrap">
  <div class="enh-header">
    <div class="enh-header-left">
      <div class="enh-header-icon">✦</div>
      <div>
        <div class="enh-header-label">Concierge Services</div>
        <div class="enh-header-title">Enhance Your Celebration</div>
      </div>
    </div>
    <div class="enh-header-right">Everything you need,<br>arranged by our team.</div>
  </div>
  <div class="enh-body">
    <div class="enh-grid">${enhItemsHtml}</div>
  </div>
  <div class="enh-footer">
    <div class="enh-footer-text">Perfect for birthdays, anniversaries, rooftop events, corporate gatherings &amp; romantic dinners.</div>
    <div class="enh-footer-cta">Ask our team →</div>
  </div>
</div>

<!-- ═══ FOOTER / CTA ═══ -->
<div class="footer">
  <div class="footer-cta">Ready to Celebrate? Let's Confirm Your Booking.</div>
  <div class="contact-row">
    <div class="contact-cell">
      <div class="contact-cell-label">WhatsApp / Call</div>
      <div class="contact-cell-value">9051459463</div>
    </div>
    <div class="contact-cell">
      <div class="contact-cell-label">Alternate</div>
      <div class="contact-cell-value">7003853624</div>
    </div>
    <div class="contact-cell">
      <div class="contact-cell-label">UPI Payment</div>
      <div class="contact-cell-value">9836014495@upi</div>
    </div>
    <div class="contact-cell">
      <div class="contact-cell-label">Website</div>
      <div class="contact-cell-value">bookmyspaces.in</div>
    </div>
  </div>
  <div class="footer-address">📍 Mukundapur, Near Ruby Hospital, EM Bypass, Kolkata</div>
  <div class="validity-note">
    This proposal is valid for 7 days from ${today}.
    Slot availability is subject to advance payment receipt.
    BookMySpaces reserves the right to release the date if advance is not received within this period.
  </div>
</div>

<!-- ═══ CLOSING STRIP ═══ -->
<div class="closing-strip">
  <div class="closing-rule"></div>
  <div class="closing-text">
    <strong style="color:#6a6a7a;font-weight:600">Digitally Generated Proposal</strong><br>
    This proposal has been generated through the BookMySpaces Proposal System and is valid without a physical signature.<br>
    For modifications or customisations, please contact our team directly.
  </div>
  <div class="closing-ref">Proposal Reference: ${(proposal as any).proposal_number || 'DRAFT'}</div>
</div>

</div>
</body>
</html>`
}
