// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/ai/operator-assistant.ts
// V3 Sprint 4 — Priority 4: AI Operator Assistant.
//
// Per the Sprint 4 protocol's explicit instruction ("Reuse the existing AI
// Context Builder. Do not introduce new AI architecture."), this is a thin
// prompt-selection layer over context-builder.ts's already-assembled
// AIContext object, not a new retrieval/orchestration system. Every one of
// the seven operator-facing features (Customer Summary, Conversation
// Summary, Suggested WhatsApp Reply, Suggested Email, Recommended Room,
// Recommended Package, Recommended Follow-up) shares one context-formatting
// function and one Anthropic call; only the task instruction appended at
// the end differs.
//
// Calls Anthropic directly with a single custom prompt, the same pattern
// src/lib/scoring.ts's generateProposalCoverNote() already uses for a
// one-shot "write text from structured data" task -- deliberately NOT
// src/lib/ai.ts's chatWithAI(), which is the multi-turn *customer-facing*
// chat pipeline with its own hardcoded SYSTEM_PROMPT that ignores caller-
// supplied context (see src/lib/providers/ai-provider.ts's header comment).
// These are operator-facing, single-shot generations with a completely
// different prompt need, so they get their own lazy-init Anthropic client,
// mirroring scoring.ts's existing pattern rather than repurposing (or
// modifying the behavior of) the customer chat pipeline.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { AIContext } from '@/types/ai-context'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _anthropic
}

export type OperatorAssistAction =
  | 'customer_summary'
  | 'conversation_summary'
  | 'suggested_whatsapp_reply'
  | 'suggested_email'
  | 'recommended_room'
  | 'recommended_package'
  | 'recommended_follow_up'

const ACTION_LABEL: Record<OperatorAssistAction, string> = {
  customer_summary: 'Customer Summary',
  conversation_summary: 'Conversation Summary',
  suggested_whatsapp_reply: 'Suggested WhatsApp Reply',
  suggested_email: 'Suggested Email',
  recommended_room: 'Recommended Room',
  recommended_package: 'Recommended Package',
  recommended_follow_up: 'Recommended Follow-up',
}

const TASK_INSTRUCTION: Record<OperatorAssistAction, string> = {
  customer_summary:
    'Write a concise 3-4 sentence summary of this customer for a hotel front-desk operator glancing at their profile: who they are, what they want, and anything noteworthy (repeat guest, price-sensitive, etc.). Plain prose, no headers or bullet points.',
  conversation_summary:
    'Summarize the recent conversation above in 2-3 sentences: what the customer is asking for and where things currently stand. Plain prose. If there is no conversation history, say so plainly instead of inventing one.',
  suggested_whatsapp_reply:
    'Draft a warm, brief WhatsApp reply (Indian English, 2-4 sentences) the operator can send right now to move this conversation forward. Write it as an actual WhatsApp message would read, not a formal letter.',
  suggested_email:
    'Draft a short, professional email the operator can send this customer. Format it as "Subject: <subject line>" on the first line, a blank line, then the body. Keep the body under 150 words.',
  recommended_room:
    "Recommend which room/inventory type best fits this customer's stated preferences and history, with a one-sentence reason. If there isn't enough information to recommend confidently, say so plainly instead of guessing.",
  recommended_package:
    'Recommend which of the available packages best fits this customer, with a one-sentence reason referencing their guest count, budget, or history where known. If there is not enough information, say so plainly instead of guessing.',
  recommended_follow_up:
    'Suggest the single best next follow-up action for this customer (what to ask, or when to check back in) in 1-2 sentences, based on where they are in the sales pipeline.',
}

function formatContextForPrompt(context: AIContext): string {
  const lines: string[] = []
  const p = context.customerProfile
  const prefs = context.customerPreferences

  lines.push(`Customer: ${p.name ?? 'Unknown'} (${p.phone ?? 'no phone on file'}, ${p.email ?? 'no email on file'}), status: ${p.status ?? 'unknown'}`)

  if (prefs.preferredEventType || prefs.preferredGuestCount || prefs.preferredVenue || prefs.notes) {
    lines.push(
      `Preferences: event type ${prefs.preferredEventType ?? '—'}, guest count ${prefs.preferredGuestCount ?? '—'}, venue ${prefs.preferredVenue ?? '—'}${prefs.notes ? `, notes: ${prefs.notes}` : ''}`
    )
  }

  if (context.reservationHistory.length) {
    lines.push('Reservation history:')
    for (const r of context.reservationHistory.slice(0, 5)) {
      lines.push(`  - ${r.status}, ${r.checkInDate} -> ${r.checkOutDate}, Rs${r.finalRoomRate}`)
    }
  }

  if (context.proposalHistory.length) {
    lines.push('Proposal history:')
    for (const pr of context.proposalHistory.slice(0, 5)) {
      lines.push(`  - ${pr.proposalNumber ?? pr.id.slice(0, 8)} (${pr.status}): ${pr.packageName ?? 'package'} — Rs${pr.totalPrice ?? 0}`)
    }
  }

  if (context.activePackages.length) {
    lines.push('Available packages:')
    for (const pkg of context.activePackages) {
      lines.push(`  - ${pkg.name}: Rs${pkg.basePrice}, up to ${pkg.maxGuests} guests, ${pkg.durationHours}h${pkg.isPopular ? ' (most popular)' : ''}`)
    }
  }

  if (context.conversationHistory.length) {
    lines.push('Recent conversation:')
    for (const m of context.conversationHistory.slice(-10)) {
      lines.push(`  ${m.role === 'user' ? 'Customer' : 'Us'}: ${m.content}`)
    }
  }

  if (context.knowledgeBaseResults.length) {
    lines.push('Relevant knowledge base notes:')
    for (const k of context.knowledgeBaseResults) lines.push(`  - ${k.content}`)
  }

  lines.push(
    `Business rules: cancellation window ${context.businessRules.cancellationWindowHours}h, advance payment ${context.businessRules.advancePaymentPercent}%, check-in ${context.businessRules.checkInTime}, check-out ${context.businessRules.checkOutTime}`
  )

  return lines.join('\n')
}

export type OperatorAssistResult =
  | { ok: true; action: OperatorAssistAction; text: string }
  | { ok: false; action: OperatorAssistAction; error: string }

/**
 * Single entry point for every AI Operator Assistant feature. `leadId`/
 * `conversationId` are only used for the ai_interaction_log audit trail
 * (best-effort, degrades silently until migration 012 is live) — the model
 * call itself only ever sees `context`.
 */
export async function runOperatorAssist(
  action: OperatorAssistAction,
  context: AIContext,
  leadId: string | null,
  conversationId: string | null = null
): Promise<OperatorAssistResult> {
  const startedAt = Date.now()
  try {
    const prompt = `You are assisting a BookMySpaces hotel/event-venue operator — you are NOT talking to the customer directly, you are helping the human operator who is.

CUSTOMER CONTEXT:
${formatContextForPrompt(context)}

TASK: ${TASK_INSTRUCTION[action]}`

    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = response.content[0]
    const text = block?.type === 'text' ? block.text.trim() : ''
    if (!text) throw new Error('Empty response from AI provider')

    await logInteraction(leadId, conversationId, action, text, Date.now() - startedAt)
    return { ok: true, action, text }
  } catch (err) {
    logger.error('operator-assistant', `${ACTION_LABEL[action]} failed`, err)
    return { ok: false, action, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Best-effort write to ai_interaction_log — migration 012 (see
 * supabase/migrations/012_v3_foundation_schema.sql, whose lead_id/
 * interaction_type/summary columns were added this same sprint after the
 * end-to-end workflow trace found timeline-service.ts already expected
 * them). Same fault-tolerance contract as every other Reservation Platform
 * write: a logging failure never fails the actual operator-facing feature.
 */
async function logInteraction(
  leadId: string | null,
  conversationId: string | null,
  action: OperatorAssistAction,
  summary: string,
  responseTimeMs: number
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('ai_interaction_log').insert({
      lead_id: leadId,
      conversation_id: conversationId,
      interaction_type: action,
      summary,
      response_time_ms: responseTimeMs,
    })
  } catch {
    // Not live yet, or any other transient failure — this is an audit
    // trail, not a correctness requirement.
  }
}
