// ═══════════════════════════════════════════════════════════════════════════
// PDF PROPOSAL GENERATOR
// Generates a beautiful HTML proposal (printable as PDF)
// Uses browser print API — no server-side PDF library needed
// ═══════════════════════════════════════════════════════════════════════════

import { ProposalData } from './scoring'

export function generateProposalHTML(
  proposal: ProposalData & { proposal_number?: string; ai_cover_note?: string }
): string {

  // ── FIELD NORMALISATION ──────────────────────────────────────────────────
  // ProposalData uses base_price / total_price / advance_required.
  // Live DB records use subtotal / total_amount / discount_value.
  // Whichever shape arrives, normalise once here so the rest of the
  // function never sees undefined.
  const basePrice: number =
    (proposal as any).base_price ??
    (proposal as any).subtotal ??
    0

  const totalPrice: number =
    (proposal as any).total_price ??
    (proposal as any).total_amount ??
    0

  const advanceRequired: number =
    (proposal as any).advance_required ??
    (proposal as any).advance_amount ??
    Math.round(totalPrice * 0.5)

  const packageName: string =
    (proposal as any).package_name ??
    (proposal as any).package ??
    'Standard'

  const venueName: string =
    (proposal as any).venue ??
    (proposal as any).venue_name ??
    'BookMySpaces'
  // ────────────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const addonsRows = proposal.addons?.length
    ? proposal.addons
        .map(
          a => `
      <tr>
        <td style="padding: 8px 0; color: #4a4a5a; font-size: 14px;">${a.name}</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a; font-size: 14px;">₹${a.price.toLocaleString('en-IN')}</td>
      </tr>`
        )
        .join('')
    : ''

  const discountRow =
    proposal.discount_amount && proposal.discount_amount > 0
      ? `<tr>
        <td style="padding: 8px 0; color: #16a34a; font-size: 14px;">Special Discount${proposal.discount_reason ? ` (${proposal.discount_reason})` : ''}</td>
        <td style="padding: 8px 0; text-align: right; color: #16a34a; font-size: 14px;">- ₹${proposal.discount_amount.toLocaleString('en-IN')}</td>
      </tr>`
      : ''

  const inclusionsList = (
    proposal.inclusions || getDefaultInclusions(packageName)
  )
    .map(inc => `<li style="padding: 4px 0; color: #4a4a5a; font-size: 14px;">${inc}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposal ${proposal.proposal_number || ''} — BookMySpaces</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'DM Sans', system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    font-size: 14px;
    line-height: 1.6;
  }

  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }

  /* Header */
  .header {
    background: linear-gradient(135deg, #0f1923 0%, #1a2840 100%);
    padding: 48px 56px 40px;
    position: relative;
    overflow: hidden;
  }

  .header::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 200px; height: 200px;
    border-radius: 50%;
    background: rgba(201,168,76,0.08);
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
  }

  .brand-name {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 28px;
    color: #ffffff;
    font-weight: 400;
    letter-spacing: 0.5px;
  }

  .brand-tag {
    font-size: 11px;
    color: #c9a84c;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .proposal-meta {
    text-align: right;
  }

  .proposal-number {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.1em;
  }

  .proposal-date {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    margin-top: 4px;
  }

  .proposal-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 40px;
    color: #ffffff;
    font-weight: 300;
    line-height: 1.2;
  }

  .proposal-subtitle {
    font-size: 13px;
    color: rgba(201,168,76,0.9);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-top: 6px;
  }

  /* Gold divider */
  .gold-divider {
    height: 2px;
    background: linear-gradient(90deg, #c9a84c, transparent);
    margin: 0 56px;
  }

  /* Content sections */
  .section {
    padding: 40px 56px;
    border-bottom: 1px solid #f0ede8;
  }

  .section-label {
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #c9a84c;
    margin-bottom: 16px;
  }

  /* Cover note */
  .cover-note {
    font-size: 15px;
    color: #2c2c2c;
    line-height: 1.8;
    white-space: pre-line;
  }

  /* Event details grid */
  .details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .detail-item {
    background: #f8f5f0;
    border-radius: 8px;
    padding: 16px;
    border-left: 3px solid #c9a84c;
  }

  .detail-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #8a8a9a;
    margin-bottom: 4px;
  }

  .detail-value {
    font-size: 15px;
    color: #1a1a1a;
    font-weight: 500;
  }

  /* Package card */
  .package-card {
    background: linear-gradient(135deg, #0f1923, #1a2840);
    border-radius: 12px;
    padding: 28px;
    color: white;
    margin-bottom: 20px;
  }

  .package-tier {
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #c9a84c;
    margin-bottom: 6px;
  }

  .package-name {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 28px;
    font-weight: 400;
  }

  .package-price {
    font-size: 32px;
    font-weight: 600;
    color: #c9a84c;
    margin-top: 8px;
    font-family: 'Cormorant Garamond', Georgia, serif;
  }

  /* Pricing table */
  .pricing-table {
    width: 100%;
    border-collapse: collapse;
  }

  .pricing-divider {
    border-top: 1px solid #e8e4de;
    margin: 8px 0;
  }

  .total-row td {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    padding: 12px 0;
    border-top: 2px solid #c9a84c;
  }

  .advance-box {
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 8px;
    padding: 16px 20px;
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .advance-label { color: #16a34a; font-size: 13px; }
  .advance-amount { color: #16a34a; font-size: 20px; font-weight: 600; }

  /* Inclusions */
  .inclusions-list {
    list-style: none;
    columns: 2;
    gap: 16px;
  }

  .inclusions-list li::before {
    content: '✔ ';
    color: #c9a84c;
    font-weight: 600;
  }

  /* Footer */
  .footer {
    padding: 32px 56px;
    background: #f8f5f0;
  }

  .footer-cta {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 22px;
    color: #1a1a1a;
    margin-bottom: 16px;
  }

  .contact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }

  .contact-item {
    font-size: 13px;
    color: #4a4a5a;
  }

  .contact-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #8a8a9a;
    margin-bottom: 4px;
  }

  .validity-note {
    font-size: 12px;
    color: #8a8a9a;
    border-top: 1px solid #e8e4de;
    padding-top: 16px;
    margin-top: 16px;
  }

  @media print {
    @page {
      size: A4;
      margin: 0;
    }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      overflow: visible !important;
    }

    .no-print { display: none !important; }
    .page { page-break-after: avoid; }
    .section-block { page-break-inside: avoid; break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="brand-name">BookMySpaces</div>
        <div class="brand-tag">Premium Hospitality · Kolkata</div>
      </div>
      <div class="proposal-meta">
        <div class="proposal-number">Proposal #${proposal.proposal_number || 'DRAFT'}</div>
        <div class="proposal-date">${today}</div>
      </div>
    </div>
    <div class="proposal-title">Event Proposal</div>
    <div class="proposal-subtitle">Prepared for ${proposal.client_name}</div>
  </div>
  <div class="gold-divider"></div>

  <!-- COVER NOTE -->
  ${proposal.ai_cover_note ? `
  <div class="section">
    <div class="section-label">A Note From Us</div>
    <div class="cover-note">${proposal.ai_cover_note}</div>
  </div>` : ''}

  <!-- EVENT DETAILS -->
  <div class="section">
    <div class="section-label">Event Details</div>
    <div class="details-grid">
      <div class="detail-item">
        <div class="detail-label">Client Name</div>
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
        <div class="detail-label">Event Date</div>
        <div class="detail-value">${new Date(proposal.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>` : ''}
      ${proposal.event_time ? `
      <div class="detail-item">
        <div class="detail-label">Event Time</div>
        <div class="detail-value">${proposal.event_time}</div>
      </div>` : ''}
      ${proposal.guest_count ? `
      <div class="detail-item">
        <div class="detail-label">Guest Count</div>
        <div class="detail-value">${proposal.guest_count} Guests</div>
      </div>` : ''}
      <div class="detail-item">
        <div class="detail-label">Venue</div>
        <div class="detail-value">${venueName}</div>
      </div>
    </div>
  </div>

  <!-- PACKAGE -->
  <div class="section">
    <div class="section-label">Selected Package</div>
    <div class="package-card">
      <div class="package-tier">BookMySpaces · ${venueName}</div>
      <div class="package-name">${packageName} Package</div>
      <div class="package-price">₹${basePrice.toLocaleString('en-IN')}</div>
    </div>

    <!-- PRICING BREAKDOWN -->
    <table class="pricing-table">
      <tr>
        <td style="padding: 8px 0; color: #4a4a5a; font-size: 14px;">${packageName} Package</td>
        <td style="padding: 8px 0; text-align: right; color: #1a1a1a; font-size: 14px;">₹${basePrice.toLocaleString('en-IN')}</td>
      </tr>
      ${addonsRows}
      ${discountRow}
      <tr class="total-row">
        <td>Total Amount</td>
        <td style="text-align: right; color: #c9a84c;">₹${totalPrice.toLocaleString('en-IN')}</td>
      </tr>
    </table>

    <div class="advance-box">
      <div>
        <div class="advance-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Advance to Confirm Booking</div>
        <div style="font-size: 12px; color: #16a34a; margin-top: 2px;">Balance due on event day</div>
      </div>
      <div class="advance-amount">₹${advanceRequired.toLocaleString('en-IN')}</div>
    </div>
  </div>

  <!-- INCLUSIONS -->
  <div class="section">
    <div class="section-label">What's Included</div>
    <ul class="inclusions-list">
      ${inclusionsList}
    </ul>
    ${proposal.special_requirements ? `
    <div style="margin-top: 20px; padding: 16px; background: #fff8e8; border-radius: 8px; border: 1px solid rgba(201,168,76,0.3);">
      <div class="section-label" style="margin-bottom: 8px;">Special Requirements Noted</div>
      <p style="color: #4a4a5a; font-size: 14px;">${proposal.special_requirements}</p>
    </div>` : ''}
  </div>

  <!-- FOOTER / CTA -->
  <div class="footer">
    <div class="footer-cta">Ready to Celebrate? Let's Confirm Your Booking.</div>

    <div class="contact-grid">
      <div class="contact-item">
        <div class="contact-label">WhatsApp / Call</div>
        9051459463
      </div>
      <div class="contact-item">
        <div class="contact-label">Alternate</div>
        7003853624
      </div>
      <div class="contact-item">
        <div class="contact-label">Website</div>
        www.bookmyspaces.in
      </div>
    </div>

    <div style="font-size: 13px; color: #4a4a5a; margin-bottom: 16px;">
      📍 Mukundapur, Near EM Bypass, Kolkata
      <br>
      To confirm your booking, please share the advance payment via UPI: <strong>9051459463@paytm</strong>
    </div>

    <div class="validity-note">
      This proposal is valid for 7 days from ${today}. Slot availability is subject to advance payment. BookMySpaces reserves the right to offer the date to other clients if advance is not received within this period.
    </div>
  </div>

</div>
</body>
</html>`
}

function getDefaultInclusions(packageName: string): string[] {
  const pkg = packageName.toLowerCase()

  if (pkg.includes('silver')) {
    return [
      'Rooftop venue (4 hours)',
      'Basic decoration setup',
      'Buffet dinner (veg + non-veg)',
      'Sound system & music',
      'Basic lighting arrangement',
      'Event support staff',
      'Setup & cleanup',
    ]
  }

  if (pkg.includes('gold')) {
    return [
      'Rooftop venue (4 hours)',
      'Premium decoration setup',
      'Buffet dinner (expanded menu)',
      'Sound system + microphone',
      'Party lighting setup',
      'Cake table setup',
      'Event support staff',
      'Setup & cleanup',
    ]
  }

  if (pkg.includes('platinum')) {
    return [
      'Rooftop venue (5 hours)',
      'Premium theme decoration',
      'Full buffet dinner',
      'DJ music setup',
      'Party lighting setup',
      'Welcome drink for all guests',
      'Cake table + stage setup',
      'Full event coordination',
      'Setup & cleanup',
    ]
  }

  return [
    'Venue as per package',
    'Decoration as agreed',
    'Food & beverages as per plan',
    'Sound & lighting',
    'Event support staff',
    'Setup & cleanup',
  ]
}
