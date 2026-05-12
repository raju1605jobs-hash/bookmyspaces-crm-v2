// ═══════════════════════════════════════════════════════════
// AI LEAD SCORING + PROPOSAL GENERATION
// ═══════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk'
import { logger } from './logger'
import { getSupabaseAdmin } from './supabase'

// ─────────────────────────────────────────
// Anthropic Client
// ─────────────────────────────────────────

let _anthropic: Anthropic | null = null

function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    })
  }

  return _anthropic
}

// ─────────────────────────────────────────
// LEAD SCORING TYPES
// ─────────────────────────────────────────

export interface LeadScore {
  score: number
  booking_probability: number
  reason: string
  priority: 'high' | 'medium' | 'low'
  suggested_action: string
}

// ─────────────────────────────────────────
// SCORE SINGLE LEAD
// ─────────────────────────────────────────

export async function scoreLeadWithAI(
  lead: any
): Promise<LeadScore> {
  try {
    const prompt = `You are a hospitality sales expert.

Score this inquiry from 1-10.

Lead:
Name: ${lead.name || 'Unknown'}
Event: ${lead.event_type || 'Unknown'}
Guests: ${lead.guest_count || 'Unknown'}
Budget: ${lead.budget || 'Unknown'}
Source: ${lead.source || 'Unknown'}

Respond ONLY as valid JSON.`

    const response =
      await getAnthropic().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })

    const text =
      response.content[0].type === 'text'
        ? response.content[0].text
        : '{}'

    const result = JSON.parse(
      text.replace(/```json|```/g, '').trim()
    )

    return {
      score: Math.min(
        10,
        Math.max(1, result.score || 5)
      ),

      booking_probability: Math.min(
        100,
        Math.max(
          0,
          result.booking_probability || 50
        )
      ),

      reason:
        result.reason ||
        'Score based on available information',

      priority: result.priority || 'medium',

      suggested_action:
        result.suggested_action ||
        'Follow up with customer',
    }
  } catch (err) {
    logger.error(
      'scoring',
      'AI scoring failed',
      err
    )

    return {
      score: 5,
      booking_probability: 50,
      reason: 'Unable to score automatically',
      priority: 'medium',
      suggested_action:
        'Review lead manually',
    }
  }
}

// ─────────────────────────────────────────
// PROPOSAL TYPES
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

  addons?: Array<{
    name: string
    price: number
  }>

  discount_amount?: number
  discount_reason?: string

  total_price: number
  advance_required: number

  special_requirements?: string
  inclusions?: string[]
}

// ─────────────────────────────────────────
// PROPOSAL COVER NOTE
// ─────────────────────────────────────────

export async function generateProposalCoverNote(
  data: ProposalData
): Promise<string> {
  try {
    const addonsText = data.addons?.length
      ? data.addons
          .map(
            (a) =>
              `${a.name} (₹${a.price.toLocaleString(
                'en-IN'
              )})`
          )
          .join(', ')
      : 'None'

    const prompt = `Write a premium hospitality proposal note.

CLIENT: ${data.client_name}
EVENT: ${data.event_type}
DATE: ${data.event_date || 'TBD'}
VENUE: ${data.venue}
TOTAL: ₹${data.total_price.toLocaleString(
      'en-IN'
    )}
ADDONS: ${addonsText}

Keep under 200 words.`

    const response =
      await getAnthropic().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })

    return response.content[0].type === 'text'
      ? response.content[0].text
      : 'Thank you for considering BookMySpaces.'
  } catch (err) {
    logger.error(
      'scoring',
      'Proposal note generation failed',
      err
    )

    return `Dear ${data.client_name},

Thank you for considering BookMySpaces for your event.

Warm regards,
BookMySpaces Team`
  }
}

// ─────────────────────────────────────────
// BATCH SCORE LEADS
// ─────────────────────────────────────────

export async function batchScoreLeads(
  limit = 20
): Promise<number> {

  // IMPORTANT:
  // Runtime initialization only
  const supabaseAdmin = getSupabaseAdmin()

  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('*')
    .is('ai_scored_at', null)
    .limit(limit)

  if (!leads || leads.length === 0) {
    return 0
  }

  let scored = 0

  for (const lead of leads) {
    try {
      const score = await scoreLeadWithAI(lead)

      await supabaseAdmin
        .from('leads')
        .update({
          ai_score: score.score,
          booking_probability:
            score.booking_probability,
          ai_score_reason: score.reason,
          ai_scored_at:
            new Date().toISOString(),
        })
        .eq('id', lead.id)

      scored++

      await new Promise((resolve) =>
        setTimeout(resolve, 200)
      )

    } catch (err) {
      logger.error(
        'scoring',
        `Failed to score lead ${lead.id}`,
        err
      )
    }
  }

  return scored
}