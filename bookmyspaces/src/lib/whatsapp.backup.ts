import { logger } from './logger'

// ═══════════════════════════════════════════════════════════════
// WHATSAPP INTEGRATION LAYER — Meta Cloud API
// Provider: Meta WhatsApp Business Cloud API (direct, no reseller)
//
// Required environment variables:
//   WHATSAPP_ACCESS_TOKEN      — Bearer token from Meta Business Suite
//   WHATSAPP_PHONE_NUMBER_ID   — Phone Number ID from Meta Developer Console
//
// Webhook verification is handled separately in:
//   src/app/api/whatsapp/webhook/route.ts
//   (uses WHATSAPP_WEBHOOK_VERIFY_TOKEN)
// ═══════════════════════════════════════════════════════════════

const WHATSAPP_ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    || ''
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const META_API_VERSION         = 'v23.0'

// ─── STARTUP DIAGNOSTIC (remove after confirming env is correct) ──
if (typeof window === 'undefined') {
  console.log('[WhatsApp] TOKEN EXISTS   :', !!WHATSAPP_ACCESS_TOKEN)
  console.log('[WhatsApp] PHONE_NUMBER_ID:', WHATSAPP_PHONE_NUMBER_ID || '(not set)')
  console.log('[WhatsApp] META CONFIGURED:', !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID))
}

// ─── CONFIGURATION CHECK ──────────────────────────────────────
export function isMetaConfigured(): boolean {
  return !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID)
}

// ─── PHONE NORMALISATION ──────────────────────────────────────
// Ensures phone is in E.164 format without the leading +
// e.g. "9051459463" → "919051459463"
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('91') ? digits : `91${digits}`
}

// ─── INTERNAL META API REQUEST HELPER ────────────────────────
async function metaRequest(body: Record<string, unknown>): Promise<unknown> {
  if (!isMetaConfigured()) {
    throw new Error(
      'Meta WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'
    )
  }
  const url = `https://graph.facebook.com/${META_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Meta API ${res.status}: ${err}`)
  }
  return res.json()
}

// ─── SEND TEXT MESSAGE (session / 24h window) ─────────────────
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<boolean> {
  if (!isMetaConfigured()) {
    logger.info('whatsapp','[WhatsApp MOCK] Would send text message (Meta not configured)',
      { phone: phone.slice(0,3)+'***', preview: message.slice(0,60) })
    return false
  }
  try {
    await metaRequest({
      messaging_product: 'whatsapp',
      to:                normalizePhone(phone),
      type:              'text',
      text:              { body: message },
    })
    return true
  } catch (err) {
    logger.error('whatsapp','sendWhatsAppMessage error', err)
    return false
  }
}

// ─── SEND APPROVED TEMPLATE MESSAGE (outside 24h window) ──────
export interface TemplateParam {
  name:  string
  value: string
}

export async function sendTemplateMessage(
  phone:           string,
  templateName:    string,
  params:          TemplateParam[] = [],
  _broadcastName?: string
): Promise<boolean> {
  if (!isMetaConfigured()) {
    logger.info('whatsapp','[WhatsApp MOCK] Template not sent (Meta not configured)',
      { template: templateName })
    return false
  }
  try {
    const metaParams = params.map(p => ({ type: 'text', text: p.value }))
    const templatePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to:                normalizePhone(phone),
      type:              'template',
      template: {
        name:       templateName,
        language:   { code: 'en' },
        components: metaParams.length > 0
          ? [{ type: 'body', parameters: metaParams }]
          : [],
      },
    }
    await metaRequest(templatePayload)
    return true
  } catch (err) {
    logger.error('whatsapp','sendTemplateMessage error', err)
    return false
  }
}

// ─── BROADCAST CAMPAIGN ───────────────────────────────────────
export interface BroadcastRecipient {
  whatsappNumber: string
  customParams?:  TemplateParam[]
}

export async function sendBroadcastCampaign(
  recipients:    BroadcastRecipient[],
  templateName:  string,
  broadcastName: string
): Promise<{ success: number; failed: number }> {
  if (!isMetaConfigured()) {
    logger.info('whatsapp','[WhatsApp MOCK] Broadcast not sent (Meta not configured)',
      { count: recipients.length })
    return { success: 0, failed: recipients.length }
  }
  let success = 0
  let failed  = 0
  for (const r of recipients) {
    const ok = await sendTemplateMessage(
      r.whatsappNumber, templateName, r.customParams, broadcastName
    )
    if (ok) success++
    else    failed++
    await new Promise(res => setTimeout(res, 120))
  }
  return { success, failed }
}

// ─── UTILITY: EXTRACT TEXT FROM INCOMING MESSAGE ──────────────
export function extractMessageText(msg: {
  type:         string
  text?:        { body: string }
  data?:        { text?: string; caption?: string }
  listReply?:   { title: string }
  buttonReply?: { title: string }
}): string {
  if (msg.type === 'text' && msg.text?.body) return msg.text.body
  if (msg.data?.text)                         return msg.data.text
  if (msg.data?.caption)                      return msg.data.caption
  if (msg.listReply?.title)                   return msg.listReply.title
  if (msg.buttonReply?.title)                 return msg.buttonReply.title
  return ''
}
