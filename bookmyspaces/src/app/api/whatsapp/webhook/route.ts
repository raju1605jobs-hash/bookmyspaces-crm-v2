// src/app/api/whatsapp/webhook/route.ts
// Meta Cloud API webhook — verification + inbound message handling

import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage }       from '@/lib/whatsapp'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { verifySignature }           from '@/lib/whatsapp/verify-signature'

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

// ─── Signature verification ───────────────────────────────────
// ISS-004 (audit/MASTER_ISSUE_REGISTER.csv): moved to
// src/lib/whatsapp/verify-signature.ts (V3 Day 2) so the Provider Framework's
// WhatsAppMessagingProvider adapter can reuse the exact same check instead of
// duplicating it. Behavior here is unchanged — same 3-state result, same
// "unconfigured" flag-first rollout (RISK_REGISTER.md).
//
// ─── POST — Incoming messages & status updates ────────────────
// Always return 200 — a non-200 causes Meta to retry for 72 hours.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signatureCheck = verifySignature(rawBody, request.headers.get('x-hub-signature-256'))

  if (signatureCheck === 'unconfigured') {
    console.warn('[WA Webhook] WHATSAPP_APP_SECRET not set — signature NOT verified. Configure it to enable ISS-004 enforcement.')
  } else if (signatureCheck === 'invalid') {
    console.error('[WA Webhook] Rejected: invalid X-Hub-Signature-256 (forged or misconfigured request).')
    return new NextResponse('Forbidden', { status: 403 })
  }

  let body: WhatsAppWebhookPayload

  try {
    body = JSON.parse(rawBody)
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
      const reply = await buildAutoReply(text, senderName)

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
// ISS-047 (audit/MASTER_ISSUE_REGISTER.csv): the "price"/"rate" branch used to return a
// hardcoded, incorrect generic rate ("Rooms start from ₹1,500/night"). It now queries the
// live `packages` table (supabase/migrations/007_missing_tables.sql) so the quoted prices
// always match whatever is actually seeded/active, instead of drifting out of sync again.
async function buildAutoReply(text: string, name: string): Promise<string> {
  const lower = text.toLowerCase()

  if (lower.includes('book') || lower.includes('availability')) {
    return `Hi ${name}! 🏡 Please share your check-in/out dates, number of guests, and property preference (Skyline Serenity or MonuRama) and we'll confirm availability right away!`
  }
  if (lower.includes('price') || lower.includes('rate')) {
    return await buildPricingReply(name)
  }
  if (lower.includes('cancel')) {
    return `Hi ${name}! For cancellations see https://www.bookmyspaces.in/cancellation.html or call +91 90514 59463.`
  }
  return `Hi ${name}! 🏡 Thanks for reaching out to Book My Space. Our team will respond shortly. Call us at +91 90514 59463 or visit www.bookmyspaces.in`
}

// ─── Pricing reply — sourced live from the `packages` table ───
async function buildPricingReply(name: string): Promise<string> {
  const fallback = `Hi ${name}! Rooms at Skyline Serenity start from ₹999/night, and our rooftop event packages at MonuRama start from ₹42,000. Share your dates and guest count for a precise quote!`

  try {
    const db = getSupabaseAdmin()
    const { data: packages, error } = await db
      .from('packages')
      .select('name, base_price, is_popular, max_guests, duration_hours')
      .eq('is_active', true)
      .order('tier', { ascending: true })

    if (error || !packages || packages.length === 0) {
      return fallback
    }

    const lines = packages.map((p: { name: string; base_price: number; is_popular: boolean; max_guests: number; duration_hours: number }) => {
      const price = Number(p.base_price || 0).toLocaleString('en-IN')
      const popular = p.is_popular ? ' ⭐ Most Popular' : ''
      return `• ${p.name} — ₹${price} (up to ${p.max_guests} guests, ${p.duration_hours}hrs)${popular}`
    })

    return [
      `Hi ${name}! Here are our current rooftop event packages at MonuRama:`,
      ...lines,
      '',
      `Rooms at Skyline Serenity start from ₹999/night.`,
      `Share your event date and guest count for a precise quote!`,
    ].join('\n')
  } catch (err) {
    console.error('[WA Webhook] buildPricingReply failed, using fallback copy:', err)
    return fallback
  }
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
