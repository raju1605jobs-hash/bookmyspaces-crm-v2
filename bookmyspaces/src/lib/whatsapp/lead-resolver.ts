// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/lead-resolver.ts
// Finds or creates a CRM lead from an inbound WhatsApp message.
// Preserves the existing UNIQUE(phone) duplicate protection on leads table.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { SourceChannel } from '@/constants/conversation-states'
import { sourceChannelToLeadSource } from './detect-source'

export interface ResolvedLead {
  id: string
  name: string | null
  isNew: boolean
}

/**
 * Find or create a lead by phone number.
 * If creating: sets source from WhatsApp channel.
 * If found: updates source_channel if it was previously unknown.
 * Returns { id, name, isNew }.
 */
export async function resolveLeadByPhone(
  phone: string,
  channel: SourceChannel,
  contactName?: string | null
): Promise<ResolvedLead> {
  const supabase  = getSupabaseAdmin()
  const leadSource = sourceChannelToLeadSource(channel)

  // 1. Try to find existing lead
  const { data: existing } = await supabase
    .from('leads')
    .select('id, name, source, source_channel')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    // Update source_channel if not yet set
    if (!existing.source_channel || existing.source_channel === 'UNKNOWN') {
      await supabase
        .from('leads')
        .update({
          source_channel: channel,
          source: leadSource,
          whatsapp_last_message_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Just update last message timestamp
      await supabase
        .from('leads')
        .update({ whatsapp_last_message_at: new Date().toISOString() })
        .eq('id', existing.id)
    }

    return { id: existing.id, name: existing.name, isNew: false }
  }

  // 2. Create new lead
  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      phone,
      name: contactName ?? null,
      source: leadSource,
      source_channel: channel,
      status: 'new_inquiry',
      whatsapp_opted_in: true,
      whatsapp_last_message_at: new Date().toISOString(),
    })
    .select('id, name')
    .single()

  if (error || !created) {
    // Edge case: concurrent insert (race) — try fetching again
    const { data: retry } = await supabase
      .from('leads')
      .select('id, name')
      .eq('phone', phone)
      .maybeSingle()

    if (retry) return { id: retry.id, name: retry.name, isNew: false }
    throw new Error(`Failed to create lead for phone ${phone}: ${error?.message}`)
  }

  // Log activity
  await supabase.from('activity_logs').insert({
    lead_id: created.id,
    action: 'lead_created',
    description: `New WhatsApp inquiry from ${channel}`,
    performed_by: 'whatsapp_bot',
    channel: 'whatsapp',
  })

  return { id: created.id, name: created.name, isNew: true }
}
