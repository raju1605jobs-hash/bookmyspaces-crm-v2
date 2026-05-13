// ═══════════════════════════════════════════════════════════
// MESSAGE QUEUE — Rate limiting + anti-spam
// ═══════════════════════════════════════════════════════════

import { getSupabaseAdmin } from './supabase'
import { logger } from './logger'
import { sendWhatsAppMessage, sendTemplateMessage, isWatiConfigured } from './whatsapp'

export interface QueuedMessage {
  phone: string
  message: string
  type?: 'session' | 'template'
  template_name?: string
  template_params?: Record<string, string>[]
  scheduled_at?: string
  metadata?: Record<string, unknown>
}

export async function enqueueMessage(msg: QueuedMessage): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { data, error } = await supabaseAdmin
      .from('message_queue')
      .insert({
        phone: msg.phone,
        message: msg.message,
        type: msg.type || 'session',
        template_name: msg.template_name,
        template_params: msg.template_params,
        scheduled_at: msg.scheduled_at || new Date().toISOString(),
        metadata: msg.metadata || {},
        status: 'pending',
        attempts: 0,
      })
      .select('id')
      .single()

    if (error) throw error
    return data?.id || null
  } catch (err) {
    logger.error('queue', 'enqueueMessage error', err)
    return null
  }
}

const phoneLastSent: Map<string, number> = new Map()
const MIN_DELAY_MS = 1500

export function isRateLimited(phone: string): boolean {
  const last = phoneLastSent.get(phone)
  if (!last) return false
  return Date.now() - last < MIN_DELAY_MS
}

export function markSent(phone: string): void {
  phoneLastSent.set(phone, Date.now())
}

export async function wasRecentlyContacted(phone: string, withinMinutes = 60): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString()
    const { count } = await supabaseAdmin
      .from('message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('status', 'sent')
      .gte('last_attempted_at', since)
    return (count || 0) > 0
  } catch {
    return false
  }
}

export async function smartSend(
  phone: string,
  message: string,
  options: {
    type?: 'session' | 'template'
    templateName?: string
    templateParams?: Array<{ name: string; value: string }>
    forceSpamCheck?: boolean
  } = {}
): Promise<boolean> {
  if (!isWatiConfigured()) {
    logger.info('queue', 'WhatsApp not configured — message skipped (mock mode)', { preview: message.slice(0, 60) })
    return false
  }

  if (options.forceSpamCheck || options.type === 'template') {
    const spammed = await wasRecentlyContacted(phone, 60)
    if (spammed) {
      logger.info('queue', 'Rate limit applied — message skipped')
      return false
    }
  }

  if (isRateLimited(phone)) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS))
  }

  let success = false

  if (options.type === 'template' && options.templateName) {
    success = await sendTemplateMessage(phone, options.templateName, options.templateParams)
  } else {
    success = await sendWhatsAppMessage(phone, message)
  }

  if (success) markSent(phone)
  return success
}