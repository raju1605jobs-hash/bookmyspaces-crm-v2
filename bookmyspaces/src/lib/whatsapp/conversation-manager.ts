// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/conversation-manager.ts
// Manages whatsapp_conversations rows.
// get/create/advance the deterministic state machine.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { ConversationState, SourceChannel } from '@/constants/conversation-states'
import type { WhatsAppConversation } from '@/types/whatsapp'

/**
 * Get or create a conversation row for a phone number.
 * UNIQUE(phone) ensures one row per contact.
 */
export async function getOrCreateConversation(
  phone: string,
  leadId: string,
  channel: SourceChannel
): Promise<WhatsAppConversation> {
  const supabase = getSupabaseAdmin()

  // Try fetch first (avoids unnecessary upsert writes)
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    // Keep lead_id and channel in sync
    const updates: Partial<WhatsAppConversation> = {
      last_message_at: new Date().toISOString(),
    }
    if (!existing.lead_id) updates.lead_id = leadId
    if (existing.source_channel === 'UNKNOWN') updates.source_channel = channel

    await supabase
      .from('whatsapp_conversations')
      .update(updates)
      .eq('id', existing.id)

    return { ...existing, ...updates } as WhatsAppConversation
  }

  // Create new conversation starting at NEW_INQUIRY
  const { data: created, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      phone,
      lead_id: leadId,
      source_channel: channel,
      current_state: ConversationState.NEW_INQUIRY,
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error || !created) {
    // Race condition: re-fetch
    const { data: retry } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone', phone)
      .maybeSingle()
    if (retry) return retry as WhatsAppConversation
    throw new Error(`Failed to create conversation for ${phone}: ${error?.message}`)
  }

  return created as WhatsAppConversation
}

/**
 * Advance the state machine and persist collected data.
 */
export async function advanceConversationState(
  conversationId: string,
  nextState: ConversationState,
  collectedData: {
    collected_name?: string
    collected_event_type?: string
    collected_event_date?: string
    collected_guest_count?: string
    lead_id?: string
  } = {}
): Promise<void> {
  const supabase = getSupabaseAdmin()

  const updates: Record<string, unknown> = {
    current_state: nextState,
    last_message_at: new Date().toISOString(),
    ...collectedData,
  }

  if (nextState === ConversationState.QUALIFIED) {
    updates.qualified_at = new Date().toISOString()
  }
  if (nextState === ConversationState.HANDOFF_TO_OPERATOR) {
    updates.handoff_at = new Date().toISOString()
  }

  await supabase
    .from('whatsapp_conversations')
    .update(updates)
    .eq('id', conversationId)
}

/**
 * Get a conversation by phone (for webhook processing).
 */
export async function getConversationByPhone(
  phone: string
): Promise<WhatsAppConversation | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  return data as WhatsAppConversation | null
}
