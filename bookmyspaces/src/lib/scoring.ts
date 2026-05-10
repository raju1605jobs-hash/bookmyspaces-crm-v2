// ═══════════════════════════════════════════════════════════
// AI LEAD SCORING + PROPOSAL GENERATION
// ═══════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk'
import { logger } from './logger'
import { Lead } from './supabase'
import { supabaseAdmin } from './supabase'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
  return _anthropic
}

// ─────────────────────────────────────────
// LEAD SCORING
// Score 1-10: how likely this lead is to convert
// ─────────────────────────────────────────
export interface LeadScore {
  score: number                  // 1-10
  booking_probability: number    // 0-100%
  reason: string
  priority: 'high' | 'medium' | 'low'
  suggested_action: string
}

export async function scoreLeadWithAI(lead: Lead): Promise<LeadScore> {
  try {
    const prompt = `You are a hospitality sales expert. Score this event inquiry lead for conversion likelihood.

LEAD DETAILS:
- Name: ${lead.name || 'Unknown'}
- Phone: ${lead.phone ? 'Provided' : 'Missing'}
- Email: ${lead.email ? 'Provided' : 'Missing'}
- Event Type: ${lead.event_type || 'Unknown'}
- Event Date: ${lead.event_date || 'Not specified'}
- Guest Count: ${lead.guest_count || 'Unknown'}
- Budget: ${lead.budget || 'Not shared'}
- Source: ${lead.source}
- Status: ${lead.status}
- Days Since Inquiry: ${Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)}
- Special Requirements: ${lead.special_requirements || 'None'}

SCORING CRITERIA:
- Completeness of info (name, phone, date, guests = higher score)
- Specificity of event date (specific date = higher score)
- Budget clarity (stated budget = higher score)
- Event type fit (birthday, anniversary, corporate = good fit)
- Source quality (WhatsApp = high intent, website = medium)
- Time decay (older leads score lower)

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "score": <1-10>,
  "booking_probability": <0-100>,
  "reason": "<2-sentence explanation>",
  "priority": "<high|medium|low>",
  "suggested_action": "<specific next action for sales team>"
}`

    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())

    return {
      score: Math.min(10, Math.max(1, result.score || 5)),
      booking_probability: Math.min(100, Math.max(0, result.booking_probability || 50)),
      reason: result.reason || 'Score based on available information',
      priority: result.priority || 'medium',
      suggested_action: result.suggested_action || 'Follow up with customer',
    }
  } catch (err) {
    logger.error('scoring', 'Lead scoring error', err)
    return {
      score: 5,
      booking_probability: 50,
      reason: 'Unable to score automatically',
      priority: 'medium',
      suggested_action: 'Review lead manually',
    }
  }
}

// ─────────────────────────────────────────
// PROPOSAL GENERATOR
// ─────────────────────────────────────────
export interface ProposalData {
  client_name: string
  client_phone?: string
  client_email?: string
  event_type: string
  event_date?: string
  event_time?: string
  guest_count?: number
  venue: string
  package_name: string
  base_price: number
  addons?: Array<{ name: string; price: number }>
  discount_amount?: number
  discount_reason?: string
  total_price: number
  advance_required: number
  special_requirements?: string
  inclusions?: string[]
}

export async function generateProposalCoverNote(data: ProposalData): Promise<string> {
  try {
    const addonsText = data.addons?.length
      ? data.addons.map(a => `${a.name} (₹${a.price.toLocaleString('en-IN')})`).join(', ')
      : 'None'

    const prompt = `Write a warm, professional event proposal cover note for a hospitality business in Kolkata.

BUSINESS: BookMySpaces / Monurama Homestay (Mukundapur, Near EM Bypass)
CLIENT: ${data.client_name}
EVENT: ${data.event_type}
DATE: ${data.event_date || 'TBD'}
TIME: ${data.event_time || 'TBD'}
GUESTS: ${data.guest_count || 'TBD'}
VENUE: ${data.venue}
PACKAGE: ${data.package_name} — ₹${data.base_price.toLocaleString('en-IN')}
ADD-ONS: ${addonsText}
TOTAL: ₹${data.total_price.toLocaleString('en-IN')}
ADVANCE: ₹${data.advance_required.toLocaleString('en-IN')}
${data.special_requirements ? `SPECIAL REQUIREMENTS: ${data.special_requirements}` : ''}

Write a 3-4 paragraph cover note that:
1. Warmly greets the client by name
2. Confirms the event details with excitement
3. Briefly highlights what makes the package special
4. Creates a gentle sense of urgency (weekend slots limited)
5. Closes with next steps (advance payment to confirm)

Tone: warm, professional, premium hospitality — like a 5-star hotel would write.
Language: English with natural Indian warmth.
Keep it under 200 words.`

    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    return response.content[0].type === 'text'
      ? response.content[0].text
      : 'Thank you for considering BookMySpaces for your special celebration.'
  } catch (err) {
    logger.error('scoring', 'Cover note generation error', err)
    return `Dear ${data.client_name},\n\nThank you for considering BookMySpaces for your ${data.event_type}. We are delighted to present this proposal and look forward to making your celebration truly memorable.\n\nPlease review the details and feel free to reach out with any questions. To confirm your booking, a small advance will secure your slot.\n\nWarm regards,\nBookMySpaces Team`
  }
}

// ─────────────────────────────────────────
// DYNAMIC PRICING LOGIC
// ─────────────────────────────────────────
export interface PricingInput {
  package: 'silver' | 'gold' | 'platinum' | 'custom'
  guest_count: number
  event_date?: string
  addons?: string[]
}

export interface PricingOutput {
  base_price: number
  addons_breakdown: Array<{ name: string; price: number }>
  addons_total: number
  subtotal: number
  recommended_advance: number
  notes: string[]
}

const PACKAGE_PRICES = {
  silver: 42000,
  gold: 50000,
  platinum: 59500,
  custom: 0,
}

const ADDON_PRICES: Record<string, number> = {
  photography: 8000,
  music: 6000,
  theme_decoration: 8500, // midpoint of 5000-12000
  extra_guests: 750,      // per person above 60
}

export function calculatePricing(input: PricingInput): PricingOutput {
  const base_price = PACKAGE_PRICES[input.package]
  const addons_breakdown: Array<{ name: string; price: number }> = []
  const notes: string[] = []

  // Process addons
  for (const addon of (input.addons || [])) {
    const price = ADDON_PRICES[addon] || 0
    if (price > 0) {
      addons_breakdown.push({
        name: addon.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        price,
      })
    }
  }

  // Extra guests (above 60)
  if (input.guest_count > 60) {
    const extraGuests = input.guest_count - 60
    const extraGuestCharge = extraGuests * 750
    addons_breakdown.push({
      name: `Extra Guests (${extraGuests} × ₹750)`,
      price: extraGuestCharge,
    })
    notes.push(`${extraGuests} extra guests above standard capacity of 60`)
  }

  // Weekend premium check
  if (input.event_date) {
    const date = new Date(input.event_date)
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      notes.push('Weekend date — advance booking strongly recommended')
    }
  }

  // Capacity check
  if (input.guest_count > 70) {
    notes.push('⚠️ Guest count exceeds maximum venue capacity of 70')
  }

  const addons_total = addons_breakdown.reduce((sum, a) => sum + a.price, 0)
  const subtotal = base_price + addons_total

  return {
    base_price,
    addons_breakdown,
    addons_total,
    subtotal,
    recommended_advance: Math.round(subtotal * 0.3), // 30% advance
    notes,
  }
}

// ─────────────────────────────────────────
// BATCH SCORE ALL UNSCORED LEADS
// ─────────────────────────────────────────
export async function batchScoreLeads(limit = 20): Promise<number> {
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('*')
    .is('ai_scored_at', null)
    .limit(limit)

  if (!leads?.length) return 0

  let scored = 0
  for (const lead of leads) {
    try {
      const score = await scoreLeadWithAI(lead as Lead)

      await supabaseAdmin
        .from('leads')
        .update({
          ai_score: score.score,
          booking_probability: score.booking_probability,
          ai_score_reason: score.reason,
          ai_scored_at: new Date().toISOString(),
        })
        .eq('id', lead.id)

      scored++
      await new Promise(r => setTimeout(r, 200)) // rate limit
    } catch (err) {
      logger.error('scoring', 'Failed to score lead ${lead.id}:', err)
    }
  }

  return scored
}
