// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/timeline/timeline-service.ts
// V3 Day 4 — Priority 5: Customer Timeline.
//
// One unified, chronological view across every existing record of contact
// with a customer. Every source is a table that already exists and is
// already written to by live production code — this service only reads and
// merges, it doesn't introduce a new place to log events:
//   - chat        -> `conversations` (website chat + WhatsApp auto-reply transcript, LIVE)
//   - whatsapp     -> `whatsapp_messages` (per-send log, LIVE — src/lib/whatsapp/send-message.ts)
//   - email        -> `email_log` (LIVE — migration 011)
//   - lead_activity/follow_up -> `activity_logs` (LIVE, split by action name)
//   - proposal     -> `proposals` (LIVE)
//   - payment      -> `invoices` (LIVE — migration 009), joined via proposals.lead_id
//   - reservation  -> `reservations` (migration 012, NOT LIVE — degrades)
//   - ai_interaction -> `ai_interaction_log` (migration 012, NOT LIVE — degrades)
//
// Same fault-tolerance contract as src/lib/ai/context-builder.ts: each
// source is fetched independently and a failure in one (typically a
// not-yet-applied-migration table) never blocks the others.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import type { CustomerTimeline, TimelineEntry, TimelineEntryType } from '@/types/timeline'

const FOLLOWUP_ACTIONS = new Set(['followup_sent', 'followup_completed', 'followup_scheduled'])

async function fetchChatEntries(leadId: string): Promise<TimelineEntry[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('conversations')
    .select('id, channel, updated_at, is_active')
    .eq('lead_id', leadId)
    .order('updated_at', { ascending: false })
    .limit(20)

  return (data ?? []).map((c) => ({
    type: 'chat' as const,
    timestamp: c.updated_at,
    title: `${c.channel === 'whatsapp' ? 'WhatsApp' : 'Website'} chat`,
    description: c.is_active ? 'Active conversation' : 'Conversation ended',
    metadata: { conversationId: c.id, channel: c.channel },
  }))
}

async function fetchWhatsAppEntries(leadId: string): Promise<TimelineEntry[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('id, direction, message_type, message_text, message_status, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(30)

  return (data ?? []).map((m) => ({
    type: 'whatsapp' as const,
    timestamp: m.created_at,
    title: m.direction === 'inbound' ? 'WhatsApp received' : 'WhatsApp sent',
    description: m.message_text ?? `[${m.message_type}]`,
    metadata: { messageId: m.id, status: m.message_status },
  }))
}

async function fetchEmailEntries(leadId: string): Promise<TimelineEntry[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('email_log')
    .select('id, subject, template_type, to_email, created_at')
    .eq('related_entity_type', 'lead')
    .eq('related_entity_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []).map((e) => ({
    type: 'email' as const,
    timestamp: e.created_at,
    title: `Email: ${e.subject}`,
    description: `${e.template_type} sent to ${e.to_email}`,
    metadata: { emailId: e.id, templateType: e.template_type },
  }))
}

async function fetchActivityEntries(leadId: string): Promise<{ leadActivity: TimelineEntry[]; followUp: TimelineEntry[] }> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('activity_logs')
    .select('id, action, description, created_at, performed_by')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(50)

  const leadActivity: TimelineEntry[] = []
  const followUp: TimelineEntry[] = []

  for (const row of data ?? []) {
    const entry: TimelineEntry = {
      type: FOLLOWUP_ACTIONS.has(row.action) ? 'follow_up' : 'lead_activity',
      timestamp: row.created_at,
      title: row.action.replace(/_/g, ' '),
      description: row.description,
      metadata: { activityId: row.id, performedBy: row.performed_by },
    }
    if (entry.type === 'follow_up') followUp.push(entry)
    else leadActivity.push(entry)
  }

  return { leadActivity, followUp }
}

async function fetchProposalEntries(leadId: string): Promise<{ entries: TimelineEntry[]; proposalIds: string[] }> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('proposals')
    .select('id, proposal_number, package_name, total_price, status, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20)

  const proposals = data ?? []

  return {
    entries: proposals.map((p) => ({
      type: 'proposal' as const,
      timestamp: p.created_at,
      title: `Proposal ${p.proposal_number ?? p.id.slice(0, 8)} (${p.status})`,
      description: p.package_name ? `${p.package_name} — Rs${p.total_price ?? 0}` : null,
      metadata: { proposalId: p.id, status: p.status },
    })),
    proposalIds: proposals.map((p) => p.id),
  }
}

async function fetchPaymentEntries(proposalIds: string[]): Promise<TimelineEntry[]> {
  if (proposalIds.length === 0) return []
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, advance_received, balance_due, status, paid_at, created_at')
    .in('proposal_id', proposalIds)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []).map((inv) => ({
    type: 'payment' as const,
    timestamp: inv.paid_at ?? inv.created_at,
    title: `Invoice ${inv.invoice_number ?? inv.id.slice(0, 8)} — ${inv.status}`,
    description: `Total Rs${inv.total_amount}, advance Rs${inv.advance_received}, balance Rs${inv.balance_due}`,
    metadata: { invoiceId: inv.id, status: inv.status },
  }))
}

async function fetchReservationEntries(leadId: string): Promise<{ entries: TimelineEntry[]; degraded: boolean }> {
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, status, check_in_date, check_out_date, final_room_rate, created_at')
      .eq('customer_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return { entries: [], degraded: true }

    return {
      entries: (data ?? []).map((r) => ({
        type: 'reservation' as const,
        timestamp: r.created_at,
        title: `Reservation ${r.status}`,
        description: `${r.check_in_date} -> ${r.check_out_date}, Rs${r.final_room_rate}`,
        metadata: { reservationId: r.id, status: r.status },
      })),
      degraded: false,
    }
  } catch {
    return { entries: [], degraded: true }
  }
}

async function fetchAIInteractionEntries(leadId: string): Promise<{ entries: TimelineEntry[]; degraded: boolean }> {
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from('ai_interaction_log')
      .select('id, interaction_type, summary, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return { entries: [], degraded: true }

    return {
      entries: (data ?? []).map((a) => ({
        type: 'ai_interaction' as const,
        timestamp: a.created_at,
        title: `AI ${a.interaction_type}`,
        description: a.summary ?? null,
        metadata: { interactionId: a.id },
      })),
      degraded: false,
    }
  } catch {
    return { entries: [], degraded: true }
  }
}

/**
 * Builds one chronological (most recent first) timeline across every
 * existing customer touchpoint. Safe to call today — live sources (chat,
 * WhatsApp, email, activity, proposals, payments) always populate; sources
 * behind migration 012 (reservations, AI interactions) return an empty
 * array with `degraded[type] = true` instead of throwing until that
 * migration is applied.
 */
export async function getCustomerTimeline(leadId: string): Promise<CustomerTimeline> {
  const [chat, whatsapp, email, activity, proposalResult, reservationResult, aiResult] = await Promise.all([
    fetchChatEntries(leadId),
    fetchWhatsAppEntries(leadId),
    fetchEmailEntries(leadId),
    fetchActivityEntries(leadId),
    fetchProposalEntries(leadId),
    fetchReservationEntries(leadId),
    fetchAIInteractionEntries(leadId),
  ])

  const payment = await fetchPaymentEntries(proposalResult.proposalIds)

  const entries: TimelineEntry[] = [
    ...chat,
    ...whatsapp,
    ...email,
    ...activity.leadActivity,
    ...activity.followUp,
    ...proposalResult.entries,
    ...payment,
    ...reservationResult.entries,
    ...aiResult.entries,
  ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))

  const degraded: Partial<Record<TimelineEntryType, boolean>> = {}
  if (reservationResult.degraded) degraded.reservation = true
  if (aiResult.degraded) degraded.ai_interaction = true

  return { leadId, entries, degraded }
}
