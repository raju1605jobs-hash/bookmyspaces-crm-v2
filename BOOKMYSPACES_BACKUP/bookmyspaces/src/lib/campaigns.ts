// ═══════════════════════════════════════════════════════════
// FESTIVAL CAMPAIGN GENERATOR
// Auto-generates festival greeting messages using AI
// ═══════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
  return _anthropic
}

export interface FestivalMessage {
  festival: string
  date: string
  message: string
  cta: string
  full_message: string
}

// ─────────────────────────────────────────
// GENERATE FESTIVAL CAMPAIGN MESSAGE
// ─────────────────────────────────────────
export async function generateFestivalMessage(
  festival: string,
  offerDetails?: string
): Promise<FestivalMessage> {
  const prompt = `Write a warm, short WhatsApp festival greeting for a premium hospitality venue in Kolkata.

Festival: ${festival}
Business: BookMySpaces / Monurama Homestay
Offer: ${offerDetails || 'Special celebration packages available'}

Requirements:
- 3-4 sentences max
- Start with festival wishes
- Naturally mention the venue for celebrations
- End with a soft call to action (WhatsApp to inquire)
- Use 2-3 relevant emojis
- Sound warm, not salesy
- Include phone: 9051459463

Return ONLY the message text, no preamble.`

  const response = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const message = response.content[0].type === 'text'
    ? response.content[0].text
    : `Wishing you a wonderful ${festival}! Celebrate with your loved ones at BookMySpaces. WhatsApp: 9051459463 🎉`

  const cta = `📲 WhatsApp: 9051459463`
  const fullMessage = message.includes('9051459463') ? message : `${message}\n\n${cta}`

  return {
    festival,
    date: new Date().toISOString().split('T')[0],
    message,
    cta,
    full_message: fullMessage,
  }
}

// ─────────────────────────────────────────
// GET UPCOMING FESTIVALS (next 30 days)
// ─────────────────────────────────────────
export async function getUpcomingFestivals(daysAhead = 30) {
  const until = new Date(Date.now() + daysAhead * 86400000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabaseAdmin
    .from('festival_calendar')
    .select('*')
    .gte('date', today)
    .lte('date', until)
    .order('date', { ascending: true })

  return data || []
}

// ─────────────────────────────────────────
// SMART SEGMENT BUILDER
// Builds recipient lists based on filters
// ─────────────────────────────────────────
export interface SegmentFilter {
  status?: string[]
  source?: string[]
  min_score?: number
  event_type?: string
  venue?: string
  is_vip?: boolean
  days_since_inquiry?: number // e.g. 30 = inquired in last 30 days
}

export async function buildSegment(filter: SegmentFilter) {
  let query = supabaseAdmin
    .from('leads')
    .select('id, name, phone, email, event_type, status, ai_score, source')
    .not('phone', 'is', null)
    .eq('whatsapp_opted_in', true)

  if (filter.status?.length) {
    query = query.in('status', filter.status)
  }

  if (filter.source?.length) {
    query = query.in('source', filter.source)
  }

  if (filter.min_score) {
    query = query.gte('ai_score', filter.min_score)
  }

  if (filter.event_type) {
    query = query.ilike('event_type', `%${filter.event_type}%`)
  }

  if (filter.venue) {
    query = query.eq('venue', filter.venue)
  }

  if (filter.is_vip === true) {
    query = query.eq('is_vip', true)
  }

  if (filter.days_since_inquiry) {
    const since = new Date(Date.now() - filter.days_since_inquiry * 86400000).toISOString()
    query = query.gte('created_at', since)
  }

  const { data } = await query.limit(1000)
  return data || []
}

// ─────────────────────────────────────────
// GENERATE CUSTOM CAMPAIGN MESSAGE WITH AI
// ─────────────────────────────────────────
export async function generateCampaignMessage(
  type: string,
  context: string,
  tone: 'warm' | 'urgent' | 'exclusive' = 'warm'
): Promise<string> {
  const toneGuide = {
    warm: 'friendly, caring, relationship-focused',
    urgent: 'creates FOMO, mentions limited availability, not pushy',
    exclusive: 'VIP feeling, premium, personalized',
  }

  const prompt = `Write a WhatsApp marketing message for a hospitality venue in Kolkata.

Campaign type: ${type}
Context: ${context}
Tone: ${toneGuide[tone]}

Business: BookMySpaces — Premium Rooftop Events & Stay in Kolkata
Contact: 9051459463

Rules:
- Max 150 words
- 2-3 emojis max
- End with clear CTA (WhatsApp or visit)
- Sound human, not corporate
- DO NOT use ALL CAPS
- DO NOT use exclamation marks excessively

Return ONLY the message text.`

  const response = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{ role: 'user', content: prompt }],
  })

  return response.content[0].type === 'text'
    ? response.content[0].text
    : `Hi! We have exciting offers at BookMySpaces. Contact us at 9051459463 to know more.`
}
