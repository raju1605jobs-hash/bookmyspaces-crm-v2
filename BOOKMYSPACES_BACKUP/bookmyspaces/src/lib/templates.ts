// ═══════════════════════════════════════════════════════════
// WHATSAPP MESSAGE TEMPLATES
// ═══════════════════════════════════════════════════════════
// These are session messages (free-form) used within 24h window
// For template messages (outside 24h), each needs WhatsApp approval
// Submit templates at: business.facebook.com → WhatsApp Manager

// ─────────────────────────────────────────
// SESSION MESSAGE TEMPLATES (use within 24h window)
// ─────────────────────────────────────────

export const WHATSAPP_MESSAGES = {
  // ── GREETING ──────────────────────────────────────────
  greeting: (name?: string) =>
    `👋 Hello${name ? ` ${name}` : ''}! Welcome to *BookMySpaces* 🌟

We manage two beautiful properties in Kolkata:

🏨 *Skyline Serenity* – Near Airport
✨ *Monurama Homestay* – Mukundapur

Please tell me what you're looking for:
1️⃣ Rooftop Event / Party
2️⃣ Private Dining
3️⃣ Room Stay
4️⃣ Café Experience
5️⃣ Banquet Hall

Just reply with a number or describe what you need! 😊`,

  // ── PACKAGE INFO ──────────────────────────────────────
  packagesOverview: () =>
    `🎉 *Rooftop Event Packages 2026*
📍 Mukundapur, Near EM Bypass

⚪ *SILVER – ₹42,000* (Up to 60 Guests)
Venue 4hrs | Decor | Buffet | Sound | Lighting | Staff

🥇 *GOLD – ₹50,000* ⭐ Most Popular (Up to 60 Guests)
Venue 4hrs | Premium Decor | Full Buffet | Mic | Party Lights | Cake Table | Staff

💎 *PLATINUM – ₹59,500* (Up to 60 Guests)
Venue 5hrs | Theme Decor | Full Buffet | DJ | Lights | Welcome Drink | Stage | Coordination

➕ *Add-ons:*
Music ₹6,000 | Photography ₹8,000 | Extra Guest ₹750/person | Theme Decor ₹5,000–12,000

📲 To book: Share your date, guest count & occasion!`,

  // ── ROOFTOP DETAILS ───────────────────────────────────
  rooftopInfo: () =>
    `🌆 *Monurama Rooftop – BookMySpaces*

Perfect for:
• 🎂 Birthday parties
• 💍 Engagements & anniversaries
• 🏢 Corporate gatherings
• 🌙 Private evening events

Capacity: 30–70 guests
Location: Mukundapur, Near EM Bypass

Available setups:
1️⃣ Day Setup
2️⃣ Premium Evening Setup

Please share:
📅 Date
👥 Guest count
🎉 Occasion`,

  // ── PRIVATE DINING ────────────────────────────────────
  privateDining: () =>
    `🍽️ *Private Dining – Monurama*

Ideal for:
• ❤️ Couple dinners
• 🎂 Mini birthday surprises
• 🎊 Small celebrations

Package starts from *₹4,999*

Please share:
📅 Date & time
👥 Number of guests
🎉 Occasion`,

  // ── SKYLINE ROOMS ─────────────────────────────────────
  skylineRooms: () =>
    `🏨 *Skyline Serenity – Near Kolkata Airport*

• Deluxe & Premium AC Rooms
• All rooms: Attached washroom, Geyser, Smart TV, WiFi
• Couple-friendly ✅
• In-house dining available
• Starting from *₹999/night*

Please share:
📅 Check-in date
⏰ Approximate check-in time
👥 Number of guests
🛏️ Deluxe or Premium?`,

  // ── CONFIRMATION PROMPT ───────────────────────────────
  confirmBooking: (name?: string, date?: string, venue?: string) =>
    `✅ Great${name ? `, ${name}` : ''}! Let me confirm your booking:

${venue ? `📍 Venue: ${venue}` : ''}
${date ? `📅 Date: ${date}` : ''}

To *block your slot*, a small advance is required.

Shall I proceed? 😊`,

  // ── PAYMENT INFO ──────────────────────────────────────
  paymentInfo: () =>
    `💳 *Payment Details*

Please make the advance via UPI:

📲 UPI ID: *9051459463@paytm* (or scan QR)
📱 PhonePe / GPay / Paytm accepted

Kindly share the payment screenshot once done. Your slot will be confirmed immediately! 🎉`,

  // ── BOOKING CONFIRMED ─────────────────────────────────
  bookingConfirmed: (params: {
    name?: string
    venue?: string
    date?: string
    time?: string
    guests?: string
    package?: string
  }) =>
    `🎉 *Booking Confirmed!*

${params.name ? `Guest: ${params.name}` : ''}
${params.venue ? `Venue: ${params.venue}` : ''}
${params.date ? `Date: ${params.date}` : ''}
${params.time ? `Time: ${params.time}` : ''}
${params.guests ? `Guests: ${params.guests}` : ''}
${params.package ? `Package: ${params.package}` : ''}

Thank you for choosing *BookMySpaces* 🙏
We look forward to making your celebration unforgettable! ✨

Any questions? We're here. 😊`,

  // ── FOLLOW-UP ─────────────────────────────────────────
  followUp: (name?: string) =>
    `Hi${name ? ` ${name}` : ''}! 😊 

Just checking in on your event inquiry at *BookMySpaces*. Have you had a chance to think about it?

We'd love to help you plan the perfect celebration! 🎉

Feel free to ask any questions — I'm here to help.`,

  // ── PRICE OBJECTION ───────────────────────────────────
  priceObjection: () =>
    `I completely understand 😊 Let me help you find the best value option!

Our *Silver Package at ₹42,000* includes everything essential for a great celebration — venue, decor, buffet, sound, and staff.

We can also customize based on your specific needs. Could you share:
💰 Your approximate budget?
👥 Guest count?

I'll suggest the best option for you! ✨`,

  // ── TRUST ─────────────────────────────────────────────
  trustMessage: () =>
    `We completely understand your concern 😊

✅ BookMySpaces is a verified hospitality platform
✅ Listed on Google Business, JustDial & VenueLook
✅ 100+ events successfully hosted
✅ Real guest reviews available
🌐 Website: www.bookmyspaces.in

You're welcome to visit the venue before booking — just let us know! 

Or connect with our manager: 📞 9051459463`,

  // ── ESCALATION TO HUMAN ───────────────────────────────
  escalateToHuman: () =>
    `Let me connect you with our team for better assistance! 😊

📞 Call / WhatsApp: *9051459463*
📞 Alternate: *7003853624*
🌐 www.bookmyspaces.in

Our team is available 9 AM – 9 PM daily.`,

  // ── URGENCY / PEAK ────────────────────────────────────
  urgency: () =>
    `⚠️ Just a heads up — *weekend slots fill very fast* at our venue!

We recommend securing your date with a small advance to avoid missing out. 

Would you like me to check availability for your preferred date? 📅`,

  // ── CAFÉ INFO ─────────────────────────────────────────
  cafeInfo: () =>
    `☕ *Monurama Café – "Under the Mango Tree"*

A cozy open-air café experience starting from *₹249*

Perfect for:
• Dates & hangouts
• Evening gatherings
• Small birthday surprises
• Quiet conversations

📍 Mukundapur, Near EM Bypass
📲 Reserve your spot: share preferred date & time!`,

  // ── CLOSING / THANKS ──────────────────────────────────
  thankYou: (name?: string) =>
    `Thank you${name ? ` ${name}` : ''} for contacting *BookMySpaces* 🙏

Feel free to reach us anytime for rooms, events, or celebrations!

📲 9051459463 | 🌐 www.bookmyspaces.in

Have a wonderful day! ✨`,
}

// ─────────────────────────────────────────
// APPROVED TEMPLATE NAMES
// (Must match exactly what's approved in WhatsApp Business Manager)
// Submit these templates before using sendTemplateMessage()
// ─────────────────────────────────────────
export const APPROVED_TEMPLATES = {
  // Triggered when a new lead comes in after 24h
  INQUIRY_FOLLOWUP: 'bookmyspaces_followup_v1',

  // Campaign template for festival/seasonal promotions
  FESTIVAL_PROMO: 'bookmyspaces_festival_promo_v1',

  // Re-engage cold leads
  REENGAGEMENT: 'bookmyspaces_reengagement_v1',

  // Booking confirmation (for records)
  BOOKING_CONFIRMATION: 'bookmyspaces_booking_confirm_v1',

  // Post-event review request
  REVIEW_REQUEST: 'bookmyspaces_review_request_v1',
}

// Template parameter builders
export const TEMPLATE_PARAMS = {
  followup: (name: string, venue: string) => [
    { name: 'name', value: name },
    { name: 'venue', value: venue },
  ],

  festivalPromo: (name: string, offerDetails: string, expiryDate: string) => [
    { name: 'name', value: name },
    { name: 'offer_details', value: offerDetails },
    { name: 'expiry_date', value: expiryDate },
  ],

  bookingConfirmation: (name: string, date: string, venue: string) => [
    { name: 'name', value: name },
    { name: 'date', value: date },
    { name: 'venue', value: venue },
  ],

  reviewRequest: (name: string, eventDate: string) => [
    { name: 'name', value: name },
    { name: 'event_date', value: eventDate },
  ],
}
