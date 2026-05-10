import { logger } from './logger'
// ═══════════════════════════════════════════════════════════
// WHATSAPP INTEGRATION LAYER
// Status: PREPARED — not yet connected to live Wati account
// Business number for future activation: 8274844343
//
// Architecture is ready. When Wati account is approved:
// 1. Set WATI_BASE_URL and WATI_API_TOKEN in .env.local
// 2. Set WATI_VERIFY_TOKEN for webhook verification
// 3. Configure webhook URL in Wati dashboard
// 4. Everything below activates automatically
// ═══════════════════════════════════════════════════════════

const WATI_BASE_URL = process.env.WATI_BASE_URL || ''
const WATI_API_TOKEN = process.env.WATI_API_TOKEN || ''

// Check if Wati is configured — used to guard all send operations
export function isWatiConfigured(): boolean {
  return !!(WATI_BASE_URL && WATI_API_TOKEN)
}

// ─── INTERNAL REQUEST HELPER ─────────────────────────────
async function watiRequest(path: string, method = 'GET', body?: unknown) {
  if (!isWatiConfigured()) {
    throw new Error('WhatsApp not yet configured. Set WATI_BASE_URL and WATI_API_TOKEN.')
  }

  const res = await fetch(`${WATI_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WATI_API_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Wati API ${res.status}: ${err}`)
  }

  return res.json()
}

// ─── NORMALIZE PHONE ─────────────────────────────────────
function toWatiPhone(phone: string): string {
  const c = phone.replace(/\D/g, '')
  return c.startsWith('91') ? c : `91${c}`
}

// ─── SEND SESSION MESSAGE (within 24h window) ────────────
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  if (!isWatiConfigured()) {
    logger.info('whatsapp', '[WhatsApp MOCK] Would send to phone (not configured)', { phone: phone.slice(0,3)+'***', preview: message.slice(0, 60) })
    return false // gracefully return false — never throw
  }

  try {
    await watiRequest('/sendSessionMessage/' + toWatiPhone(phone), 'POST', {
      messageText: message,
    })
    return true
  } catch (err) {
    logger.error('whatsapp', 'sendWhatsAppMessage error', err)
    return false
  }
}

// ─── SEND APPROVED TEMPLATE ──────────────────────────────
export interface TemplateParam {
  name: string
  value: string
}

export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  params: TemplateParam[] = [],
  broadcastName?: string
): Promise<boolean> {
  if (!isWatiConfigured()) {
    logger.info('whatsapp', '[WhatsApp MOCK] Template not sent (not configured)', { template: templateName })
    return false
  }

  try {
    await watiRequest('/sendTemplateMessage', 'POST', {
      whatsappNumber: toWatiPhone(phone),
      template_name: templateName,
      broadcast_name: broadcastName || templateName,
      parameters: params,
    })
    return true
  } catch (err) {
    logger.error('whatsapp', 'sendTemplateMessage error', err)
    return false
  }
}

// ─── BROADCAST CAMPAIGN ──────────────────────────────────
export interface BroadcastRecipient {
  whatsappNumber: string
  customParams?: TemplateParam[]
}

export async function sendBroadcastCampaign(
  recipients: BroadcastRecipient[],
  templateName: string,
  broadcastName: string
): Promise<{ success: number; failed: number }> {
  if (!isWatiConfigured()) {
    logger.info('whatsapp', '[WhatsApp MOCK] Broadcast not sent (not configured)', { count: recipients.length })
    return { success: 0, failed: recipients.length }
  }

  let success = 0
  let failed = 0

  for (const r of recipients) {
    const ok = await sendTemplateMessage(
      r.whatsappNumber,
      templateName,
      r.customParams,
      broadcastName
    )
    if (ok) success++
    else failed++
    await new Promise(res => setTimeout(res, 120)) // rate limit
  }

  return { success, failed }
}

// ─── INCOMING MESSAGE TYPES ──────────────────────────────
export interface WatiIncomingMessage {
  id: string
  waId: string
  wamid: string
  timestamp: string
  owner: string
  text?: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'voice' | 'location' | 'interactive'
  data?: {
    text?: string
    caption?: string
    filename?: string
    id?: string
    url?: string
  }
  listReply?: { id: string; title: string }
  buttonReply?: { id: string; title: string }
}

export interface WatiWebhookPayload {
  type: 'message' | 'status'
  waId: string
  senderName: string
  messages?: WatiIncomingMessage[]
  statuses?: Array<{ id: string; status: 'sent' | 'delivered' | 'read' | 'failed' }>
}

export function extractMessageText(msg: WatiIncomingMessage): string {
  if (msg.type === 'text' && msg.text) return msg.text
  if (msg.data?.text) return msg.data.text
  if (msg.data?.caption) return msg.data.caption
  if (msg.listReply?.title) return msg.listReply.title
  if (msg.buttonReply?.title) return msg.buttonReply.title
  return ''
}

// ─── WEBHOOK SIGNATURE VERIFICATION ─────────────────────
export function verifyWatiWebhook(payload: string, signature: string): boolean {
  const secret = process.env.WATI_WEBHOOK_SECRET
  if (!secret) return true // skip if not configured

  try {
    const crypto = require('crypto')
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    return signature === expected
  } catch {
    return false
  }
}

// ─── INTERAKT ADAPTER (alternative provider) ─────────────
export async function sendInteraktMessage(phone: string, message: string): Promise<boolean> {
  const key = process.env.INTERAKT_API_KEY
  if (!key) {
    logger.info('whatsapp', 'Interakt not configured — message skipped (mock mode)')
    return false
  }

  try {
    const c = phone.replace(/\D/g, '')
    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        countryCode: '+91',
        phoneNumber: c,
        callbackData: 'aria-reply',
        type: 'Text',
        data: { message },
      }),
    })
    return res.ok
  } catch (err) {
    logger.error('whatsapp', 'sendInteraktMessage error', err)
    return false
  }
}
