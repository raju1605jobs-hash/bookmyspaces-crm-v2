// src/app/api/whatsapp/webhook/route.ts
// Meta Cloud API webhook — verification + inbound message handling

import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage }       from '@/lib/whatsapp'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 30

// ─── GET — Meta webhook verification ─────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (!verifyToken) {
    console.error(
      '[WA Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set.',
      'Add it in Vercel → Project → Settings → Environment Variables, then redeploy.'
    )
    return new NextResponse('Server configuration error', { status: 500 })
  }

  const cleanVerifyToken   = verifyToken.trim()
  const cleanTokenFromMeta = (token ?? '').trim()

  if (mode === 'subscribe' && cleanVerifyToken === cleanTokenFromMeta) {
    if (!challenge) {
      return new NextResponse('Bad Request: missing challenge', { status: 400 })
    }
    return new NextResponse(challenge, {
      status:  200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// ─── POST — Incoming messages & status updates ────────────────
// Always return 200 — a non-200 causes Meta to retry for 72 hours.
export async function POST(request: NextRequest) {
  let body: WhatsAppWebhookPayload

  try {
    body = await request.json()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  if (body.object !== 'whatsapp_business_account') {
    return new NextResponse('OK', { status: 200 })
  }

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value

        // Delivery / read status updates — log only
        for (const status of value.statuses ?? []) {
          console.log('[WA] Status update:', {
            id:        status.id,
            status:    status.status,
            recipient: status.recipient_id,
            errors:    status.errors ?? null,
          })
        }

        // Inbound messages
        for (const message of value.messages ?? []) {
          const contact    = value.contacts?.find(c => c.wa_id === message.from)
          const senderName = contact?.profile?.name ?? 'Unknown'
          await handleIncomingMessage(message, senderName)
        }
      }
    }
  } catch (err) {
    console.error('[WA Webhook] Error processing payload:', err)
  }

  return new NextResponse('OK', { status: 200 })
}

// ─── Message dispatcher ───────────────────────────────────────
async function handleIncomingMessage(
  message:    WhatsAppMessage,
  senderName: string
) {
  const from = message.from

  try {
    if (message.type === 'text') {
      const text  = message.text?.body ?? ''
      const reply = buildAutoReply(text, senderName)

      // Send reply first — never block on DB
      await sendWhatsAppMessage(from, reply)

      // Persist inbound + outbound to conversations table
      await persistConversation(from, senderName, text, reply)
    }
  } catch (err) {
    console.error(`[WA Webhook] Error handling message from ${from}:`, err)
  }
}

// ─── Persist inbound message + auto-reply to DB ───────────────
// Uses phone as session_id for WhatsApp conversations.
// Upserts conversation row, appends both turns to messages JSONB array.
// Updates lead timestamps if a matching lead exists.
async function persistConversation(
  phone:      string,
  senderName: string,
  inbound:    string,
  outbound:   string
): Promise<void> {
  const db        = getSupabaseAdmin()
  const sessionId = `wa_${phone}`
  const now       = new Date().toISOString()

  // 1. Look up lead by phone
  const { data: lead } = await db
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  const leadId = lead?.id ?? null

  // 2. Fetch existing conversation (to append, not overwrite)
  const { data: existing } = await db
    .from('conversations')
    .select('id, messages')
    .eq('session_id', sessionId)
    .maybeSingle()

  const prevMessages: ConversationMessage[] =
    Array.isArray(existing?.messages) ? existing.messages : []

  const newMessages: ConversationMessage[] = [
    ...prevMessages,
    { role: 'user',      content: inbound,  timestamp: now },
    { role: 'assistant', content: outbound, timestamp: now },
  ]

  if (existing?.id) {
    // Update existing conversation
    await db
      .from('conversations')
      .update({
        messages:   newMessages,
        updated_at: now,
        ...(leadId && { lead_id: leadId }),
      })
      .eq('id', existing.id)
  } else {
    // Insert new conversation
    await db
      .from('conversations')
      .insert({
        session_id:      sessionId,
        channel:         'whatsapp',
        lead_id:         leadId,
        messages:        newMessages,
        extracted_name:  senderName !== 'Unknown' ? senderName : null,
        extracted_phone: phone,
        is_active:       true,
      })
  }

  // 3. Update lead timestamps if lead exists
  if (leadId) {
    await db
      .from('leads')
      .update({
        last_contacted_at:       now,
        whatsapp_last_message_at: now,
        updated_at:               now,
      })
      .eq('id', leadId)
  }
}

// ─── Auto-reply builder ───────────────────────────────────────
function buildAutoReply(text: string, name: string): string {
  const lower = text.toLowerCase()

  if (lower.includes('book') || lower.includes('availability')) {
    return `Hi ${name}! 🏡 Please share your check-in/out dates, number of guests, and property preference (Skyline Serenity or MonuRama) and we'll confirm availability right away!`
  }
  if (lower.includes('price') || lower.includes('rate')) {
    return `Hi ${name}! Rooms start from ₹1,500/night including breakfast. Share your dates for a precise quote!`
  }
  if (lower.includes('cancel')) {
    return `Hi ${name}! For cancellations see https://www.bookmyspaces.in/cancellation.html or call +91 90514 59463.`
  }
  return `Hi ${name}! 🏡 Thanks for reaching out to Book My Space. Our team will respond shortly. Call us at +91 90514 59463 or visit www.bookmyspaces.in`
}

// ─── Types ────────────────────────────────────────────────────
interface ConversationMessage {
  role:      'user' | 'assistant'
  content:   string
  timestamp: string
}

interface WhatsAppMessage {
  from:      string
  id:        string
  timestamp: string
  type:      string
  text?:     { body: string }
}

interface WhatsAppContact {
  profile: { name: string }
  wa_id:   string
}

interface WhatsAppStatusUpdate {
  id:           string
  status:       'sent' | 'delivered' | 'read' | 'failed'
  timestamp:    string
  recipient_id: string
  errors?:      Array<{ code: number; title: string }>
}

interface WhatsAppValue {
  messaging_product: 'whatsapp'
  metadata:          { display_phone_number: string; phone_number_id: string }
  contacts?:         WhatsAppContact[]
  messages?:         WhatsAppMessage[]
  statuses?:         WhatsAppStatusUpdate[]
}

interface WhatsAppWebhookPayload {
  object: string
  entry:  Array<{
    id:      string
    changes: Array<{ value: WhatsAppValue; field: string }>
  }>
}
