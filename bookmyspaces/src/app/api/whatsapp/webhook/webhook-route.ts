// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/api/whatsapp/webhook/route.ts
//
// WhatsApp Cloud API webhook endpoint.
// Replaces the existing stub with full Cloud API support.
//
// PRESERVED:
//   - GET handler for webhook verification (Meta challenge)
//   - POST handler structure
//   - export const dynamic / runtime / maxDuration
//
// ADDED:
//   - Full Cloud API payload parsing
//   - Idempotent message processing
//   - Status update handling
//   - Source channel detection
//   - Structured auto-response pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { processInboundMessage, processStatusUpdate } from '@/services/whatsapp/process-inbound'
import type { WAWebhookPayload, WAInboundMessage, WAContact } from '@/types/whatsapp'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 30

// ─── GET — Webhook Verification ───────────────────────────────────────────────
// Meta sends a GET with hub.challenge when registering the webhook.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('[WA Webhook] Verification successful')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[WA Webhook] Verification failed — token mismatch')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── POST — Receive Messages & Status Updates ─────────────────────────────────
export async function POST(req: NextRequest) {
  // Always respond 200 immediately to Meta — prevents retries
  // Processing happens synchronously within the Vercel function timeout

  let body: WAWebhookPayload
  try {
    body = await req.json()
  } catch {
    console.error('[WA Webhook] Invalid JSON body')
    return NextResponse.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 })
  }

  // Validate this is a WhatsApp webhook
  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ignored' }, { status: 200 })
  }

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value

        // ── Handle inbound messages ──
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            // Find matching contact profile
            const contact: WAContact | undefined = value.contacts?.find(
              (c: WAContact) => c.wa_id === message.from
            )

            // Build raw payload snapshot for debugging
            const rawPayload = { entry_id: entry.id, change, message } as Record<string, unknown>

            // Fire-and-forget with error capture
            await processInboundMessage(
              message as WAInboundMessage,
              contact,
              rawPayload
            ).catch(err => {
              console.error(`[WA Webhook] processInboundMessage error for ${message.from}:`, err)
            })
          }
        }

        // ── Handle delivery status updates ──
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            await processStatusUpdate(status.id, status.status).catch(err => {
              console.error(`[WA Webhook] processStatusUpdate error for ${status.id}:`, err)
            })
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA Webhook] Unexpected error:', err)
    // Still return 200 — Meta should not retry
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
