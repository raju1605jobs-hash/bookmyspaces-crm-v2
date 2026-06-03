import { logger } from './logger'

// ═══════════════════════════════════════════════════════════════
// WHATSAPP INTEGRATION LAYER — Meta Cloud API v23.0
// Provider: Meta WhatsApp Business Cloud API (direct)
//
// Required environment variables:
//   WHATSAPP_ACCESS_TOKEN      — Bearer token from Meta Business Suite
//   WHATSAPP_PHONE_NUMBER_ID   — Phone Number ID from Meta Developer Console
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN — Webhook verification (webhook route only)
//
// ⚠️  Env vars are read inside functions at call time, NOT at module
//    load time. Vercel serverless functions bundle modules before env
//    vars are injected; top-level const reads return '' on cold start.
// ═══════════════════════════════════════════════════════════════

const META_API_VERSION = 'v23.0'

// ─── CONFIGURATION CHECK ──────────────────────────────────────
export function isMetaConfigured(): boolean {
  const token    = (process.env.WHATSAPP_ACCESS_TOKEN    ?? '').trim()
  const numberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()

  console.log('[WhatsApp] isMetaConfigured check:')
  console.log('[WhatsApp]   TOKEN EXISTS    :', token.length > 0)
  console.log('[WhatsApp]   TOKEN LENGTH    :', token.length)
  console.log('[WhatsApp]   PHONE_NUMBER_ID :', numberId || 'MISSING')
  console.log('[WhatsApp]   META CONFIGURED :', !!(token && numberId))

  if (!token) {
    console.warn('[WhatsApp] WHATSAPP_ACCESS_TOKEN is not set or empty')
  }
  if (!numberId) {
    console.warn('[WhatsApp] WHATSAPP_PHONE_NUMBER_ID is not set or empty')
  }

  return !!(token && numberId)
}

// ─── PHONE NORMALISATION ──────────────────────────────────────
// Strips all non-digit characters and ensures Indian E.164 format
// without leading +.
// Examples:
//   "9051459463"    → "919051459463"
//   "+919051459463" → "919051459463"
//   "919051459463"  → "919051459463"
function normalizePhone(phone: string): string {
  const digits     = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('91') && digits.length === 12
    ? digits
    : `91${digits}`

  console.log(`[WhatsApp] normalizePhone: input="${phone}" digits="${digits}" normalized="${normalized}"`)
  return normalized
}

// ─── INTERNAL META API REQUEST HELPER ────────────────────────
// Reads env vars at call time. Throws on non-2xx responses with
// the full Meta error body included in the message.
async function metaRequest(body: Record<string, unknown>): Promise<unknown> {
  const accessToken   = (process.env.WHATSAPP_ACCESS_TOKEN    ?? '').trim()
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()

  if (!accessToken || !phoneNumberId) {
    const reason =
      `Meta not configured — ` +
      `WHATSAPP_ACCESS_TOKEN: ${accessToken ? 'present' : 'MISSING'}, ` +
      `WHATSAPP_PHONE_NUMBER_ID: ${phoneNumberId ? 'present' : 'MISSING'}`
    console.error('[WhatsApp] metaRequest aborted:', reason)
    throw new Error(reason)
  }

  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  console.log('[WhatsApp] metaRequest →', url)
  console.log('[WhatsApp] payload     :', JSON.stringify(body))
  console.log('[WhatsApp] token prefix:', accessToken.slice(0, 10) + '...')

  let res: Response
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr)
    console.error('[WhatsApp] Network error contacting Meta API:', msg)
    throw new Error(`Meta API network error: ${msg}`)
  }

  const responseText = await res.text()

  console.error('[META FULL RESPONSE]')
  console.error(res.status)
  console.error(responseText)

  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${responseText}`)
  }

  try {
    return JSON.parse(responseText)
  } catch {
    return responseText
  }
}

// ─── SEND TEXT MESSAGE (session / 24h window) ─────────────────
// For free-form messages within 24 hours of the last customer message.
// Outside the 24h window, use sendTemplateMessage() with an approved template.
export async function sendWhatsAppMessage(
  phone:   string,
  message: string
): Promise<boolean> {
  console.log('[WhatsApp] sendWhatsAppMessage called')
  console.log('[WhatsApp]   phone  :', phone.slice(0, 4) + '***')
  console.log('[WhatsApp]   preview:', message.slice(0, 80))

  if (!isMetaConfigured()) {
    logger.info(
      'whatsapp',
      '[WhatsApp MOCK] sendWhatsAppMessage skipped — Meta not configured',
      { phone: phone.slice(0, 3) + '***', preview: message.slice(0, 60) }
    )
    return false
  }

  try {
    const result = await metaRequest({
      messaging_product: 'whatsapp',
      to:                normalizePhone(phone),
      type:              'text',
      text:              { body: message },
    })
    console.log('[WhatsApp] sendWhatsAppMessage SUCCESS:', JSON.stringify(result))
    return true
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : undefined
    console.error('[WhatsApp] sendWhatsAppMessage FAILED')
    console.error('[WhatsApp]   error  :', msg)
    if (stack) console.error('[WhatsApp]   stack  :', stack)
    logger.error('whatsapp', 'sendWhatsAppMessage error', err)
    return false
  }
}

// ─── SEND APPROVED TEMPLATE MESSAGE (outside 24h window) ──────
// Templates must be approved in Meta Business Manager before use.
// Submit at: business.facebook.com → WhatsApp Manager → Message Templates
//
// Parameter order in `params` must match {{1}}, {{2}} order in the template.
export interface TemplateParam {
  name:  string
  value: string
}

export async function sendTemplateMessage(
  phone:           string,
  templateName:    string,
  params:          TemplateParam[] = [],
  _broadcastName?: string          // call-site compatibility only, unused by Meta
): Promise<boolean> {
  console.log('[WhatsApp] sendTemplateMessage called')
  console.log('[WhatsApp]   phone   :', phone.slice(0, 4) + '***')
  console.log('[WhatsApp]   template:', templateName)
  console.log('[WhatsApp]   params  :', JSON.stringify(params))

  if (!isMetaConfigured()) {
    logger.info(
      'whatsapp',
      '[WhatsApp MOCK] sendTemplateMessage skipped — Meta not configured',
      { template: templateName }
    )
    return false
  }

  try {
    const metaParams = params.map(p => ({ type: 'text', text: p.value }))

    const payload: Record<string, unknown> = {
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

    const result = await metaRequest(payload)
    console.log('[WhatsApp] sendTemplateMessage SUCCESS:', JSON.stringify(result))
    return true
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : undefined
    console.error('[WhatsApp] sendTemplateMessage FAILED')
    console.error('[WhatsApp]   error   :', msg)
    console.error('[WhatsApp]   template:', templateName)
    if (stack) console.error('[WhatsApp]   stack   :', stack)
    logger.error('whatsapp', 'sendTemplateMessage error', err)
    return false
  }
}

// ─── BROADCAST CAMPAIGN ───────────────────────────────────────
// Sends the same approved template to multiple recipients.
// 120ms inter-message delay to respect Meta rate limits (~500/min).
export interface BroadcastRecipient {
  whatsappNumber: string
  customParams?:  TemplateParam[]
}

export async function sendBroadcastCampaign(
  recipients:    BroadcastRecipient[],
  templateName:  string,
  broadcastName: string
): Promise<{ success: number; failed: number }> {
  console.log(`[WhatsApp] sendBroadcastCampaign: template=${templateName} recipients=${recipients.length}`)

  if (!isMetaConfigured()) {
    logger.info(
      'whatsapp',
      '[WhatsApp MOCK] Broadcast skipped — Meta not configured',
      { count: recipients.length }
    )
    return { success: 0, failed: recipients.length }
  }

  let success = 0
  let failed  = 0

  for (const r of recipients) {
    const ok = await sendTemplateMessage(
      r.whatsappNumber,
      templateName,
      r.customParams,
      broadcastName
    )
    if (ok) success++
    else    failed++
    await new Promise(res => setTimeout(res, 120))
  }

  console.log(`[WhatsApp] sendBroadcastCampaign done: success=${success} failed=${failed}`)
  return { success, failed }
}

// ─── UTILITY: EXTRACT TEXT FROM INCOMING MESSAGE ──────────────
// Provider-agnostic helper for webhook inbound message parsing.
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
