// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/send-message.ts
// Retry-safe outbound message sender for WhatsApp Cloud API.
// Logs every attempt to whatsapp_messages table.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { MessageDirection, MessageStatus, SourceChannel } from '@/constants/conversation-states'
import type { WASendTextRequest, WASendTemplateRequest, WASendResponse, SendMessageResult } from '@/types/whatsapp'

const WA_API_VERSION = 'v19.0'
const MAX_RETRIES    = 2
const RETRY_DELAY_MS = 500

// ─── Core send function ───────────────────────────────────────────────────────

async function callWhatsAppAPI(
  payload: WASendTextRequest | WASendTemplateRequest
): Promise<WASendResponse> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    throw new Error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN env vars')
  }

  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`WhatsApp API error ${res.status}: ${errBody}`)
  }

  return res.json() as Promise<WASendResponse>
}

// ─── Send text message (retry-safe) ──────────────────────────────────────────

export async function sendWhatsAppText(
  to: string,
  body: string,
  opts: {
    leadId?: string | null
    conversationId?: string | null
    conversationState?: string | null
    sourceChannel?: SourceChannel
  } = {}
): Promise<SendMessageResult> {
  const supabase = getSupabaseAdmin()

  // Insert pending log first so we always have a record
  const { data: logRow } = await supabase
    .from('whatsapp_messages')
    .insert({
      phone: to,
      lead_id: opts.leadId ?? null,
      conversation_id: opts.conversationId ?? null,
      source_channel: opts.sourceChannel ?? SourceChannel.UNKNOWN,
      direction: MessageDirection.OUTBOUND,
      message_type: 'text',
      message_text: body,
      message_status: MessageStatus.PENDING,
      conversation_state: opts.conversationState ?? null,
      raw_payload: { to, body },
    })
    .select('id')
    .single()

  const logId = logRow?.id ?? null

  const payload: WASendTextRequest = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  }

  let lastError: string | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callWhatsAppAPI(payload)
      const waMessageId = response.messages?.[0]?.id ?? null

      // Update log with success
      if (logId) {
        await supabase
          .from('whatsapp_messages')
          .update({
            message_status: MessageStatus.SENT,
            whatsapp_message_id: waMessageId,
          })
          .eq('id', logId)
      }

      return { success: true, waMessageId: waMessageId ?? undefined }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[WA Send] Attempt ${attempt + 1} failed for ${to}:`, lastError)

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
      }
    }
  }

  // All retries exhausted — mark failed
  if (logId) {
    await supabase
      .from('whatsapp_messages')
      .update({ message_status: MessageStatus.FAILED })
      .eq('id', logId)
  }

  console.error(`[WA Send] All retries failed for ${to}:`, lastError)
  return { success: false, error: lastError ?? 'Unknown error' }
}

// ─── Send template message ────────────────────────────────────────────────────

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: WASendTemplateRequest['template']['components'],
  opts: {
    leadId?: string | null
    conversationId?: string | null
    sourceChannel?: SourceChannel
  } = {}
): Promise<SendMessageResult> {
  const supabase = getSupabaseAdmin()

  const { data: logRow } = await supabase
    .from('whatsapp_messages')
    .insert({
      phone: to,
      lead_id: opts.leadId ?? null,
      conversation_id: opts.conversationId ?? null,
      source_channel: opts.sourceChannel ?? SourceChannel.UNKNOWN,
      direction: MessageDirection.OUTBOUND,
      message_type: 'template',
      template_name: templateName,
      message_status: MessageStatus.PENDING,
      raw_payload: { to, templateName, languageCode },
    })
    .select('id')
    .single()

  const logId = logRow?.id ?? null

  const payload: WASendTemplateRequest = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  }

  try {
    const response = await callWhatsAppAPI(payload)
    const waMessageId = response.messages?.[0]?.id ?? null

    if (logId) {
      await supabase
        .from('whatsapp_messages')
        .update({ message_status: MessageStatus.SENT, whatsapp_message_id: waMessageId })
        .eq('id', logId)
    }

    return { success: true, waMessageId: waMessageId ?? undefined }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (logId) {
      await supabase
        .from('whatsapp_messages')
        .update({ message_status: MessageStatus.FAILED })
        .eq('id', logId)
    }
    return { success: false, error: errMsg }
  }
}
