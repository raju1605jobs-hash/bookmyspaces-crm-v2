export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { isWatiConfigured, WatiWebhookPayload, WatiIncomingMessage, extractMessageText } from '@/lib/whatsapp'
import { chatWithAI, extractLeadFromTag, extractLeadViaAI, mergeExtracted, cleanAIResponse, hasMinimumLeadData, sanitizeString, parseGuestCount, parseEventDate, Message } from '@/lib/ai'
import { getSupabaseAdmin } from '@/lib/supabase'
import { syncLeadToSheets } from '@/lib/sheets'
import { smartSend, isRateLimited } from '@/lib/queue'
import { logger } from '@/lib/logger'

const ESCALATION_KEYWORDS = [
  'speak to manager', 'talk to someone', 'real person', 'human agent',
  'not happy', 'complaint', 'refund', 'cheating', 'fraud', 'scam',
  'police', 'court', 'angry', 'disgusting', 'worst',
]

function shouldEscalate(message: string): boolean {
  const lower = message.toLowerCase()
  return ESCALATION_KEYWORDS.some(k => lower.includes(k))
}

async function handleIncomingMessage(waId: string, senderName: string, msg: WatiIncomingMessage) {
  const supabaseAdmin = getSupabaseAdmin()
  const phone = waId.replace(/\D/g, '').replace(/^91/, '')
  let userText = extractMessageText(msg)

  if ((msg.type === 'audio' || msg.type === 'voice') && msg.data?.url) {
    try {
      const { transcribeVoiceNote } = await import('@/lib/transcription')
      const transcribed = await transcribeVoiceNote(msg.data.url)
      if (transcribed) {
        userText = `[Voice message]: ${transcribed}`
        await smartSend(phone, `🎙️ I heard: "${transcribed.slice(0, 100)}"`, { type: 'session' })
      } else {
        await smartSend(phone, "Received your voice message but couldn't understand it 😔 Could you type your question?", { type: 'session' })
        return
      }
    } catch {
      await smartSend(phone, "Could you please type your question? 😊", { type: 'session' })
      return
    }
  }

  if (!userText.trim()) return
  if (isRateLimited(phone)) return

  const sessionId = `wa_${phone}`
  const { data: existingConv } = await supabaseAdmin.from('conversations').select('id, messages, lead_id').eq('session_id', sessionId).maybeSingle()
  const existingMessages: Message[] = Array.isArray(existingConv?.messages) ? (existingConv!.messages as Message[]) : []

  if (shouldEscalate(userText)) {
    await smartSend(phone, "Let me connect you with our manager who can better assist you 😊\n\n📞 WhatsApp / Call: *9051459463*\n📞 Alternate: *7003853624*\n\nAvailable: 9 AM – 9 PM daily.", { type: 'session' })
    if (existingConv?.id) await supabaseAdmin.from('conversations').update({ is_escalated: true, escalation_reason: userText.slice(0, 200) }).eq('id', existingConv.id)
    return
  }

  const messagesForAI: Message[] = [...existingMessages.slice(-18), { role: 'user', content: userText }]
  const aiResponseRaw = await chatWithAI(messagesForAI, userText)
  const aiResponseClean = cleanAIResponse(aiResponseRaw)

  const chunks = splitMessage(aiResponseClean, 3500)
  for (let i = 0; i < chunks.length; i++) {
    await smartSend(phone, chunks[i], { type: 'session' })
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 600))
  }

  const fromTag = extractLeadFromTag(aiResponseRaw)
  const fromAI = !hasMinimumLeadData(fromTag) && existingMessages.length >= 2
    ? await extractLeadViaAI(messagesForAI.map(m => `${m.role === 'user' ? 'Customer' : 'Aria'}: ${m.content}`).join('\n'))
    : null
  const extracted = mergeExtracted(fromTag, fromAI)

  const updatedMessages = [
    ...(existingConv?.messages || []),
    { role: 'user' as const, content: userText, timestamp: new Date().toISOString() },
    { role: 'assistant' as const, content: aiResponseClean, timestamp: new Date().toISOString() },
  ].slice(-40)

  const convPayload: Record<string, unknown> = { session_id: sessionId, channel: 'whatsapp', messages: updatedMessages, is_active: true }
  if (extracted?.name) convPayload.extracted_name = extracted.name
  if (extracted?.phone) convPayload.extracted_phone = extracted.phone
  if (extracted?.event_type) convPayload.extracted_event_type = extracted.event_type
  if (extracted?.event_date) convPayload.extracted_event_date = extracted.event_date
  if (extracted?.guest_count) convPayload.extracted_guest_count = extracted.guest_count
  if (extracted?.budget) convPayload.extracted_budget = extracted.budget

  if (existingConv?.id) {
    await supabaseAdmin.from('conversations').update(convPayload).eq('id', existingConv.id)
  } else {
    await supabaseAdmin.from('conversations').insert(convPayload).select('id').single()
  }

  if (hasMinimumLeadData(extracted)) {
    const guestCount = parseGuestCount(extracted?.guest_count)
    const { data: existingLead } = phone ? await supabaseAdmin.from('leads').select('id').eq('phone', phone).maybeSingle() : { data: null }

    const leadFields = {
      ...(extracted?.name && { name: sanitizeString(extracted.name) }),
      phone: phone || null,
      ...(extracted?.event_type && { event_type: sanitizeString(extracted.event_type) }),
      ...(extracted?.event_date ? { event_date: parseEventDate(extracted.event_date) } : {}),
      ...(guestCount && { guest_count: guestCount }),
      ...(extracted?.budget && { budget: sanitizeString(extracted.budget) }),
      source: 'whatsapp' as const,
      last_contacted_at: new Date().toISOString(),
    }

    if (existingLead) {
      await supabaseAdmin.from('leads').update(leadFields).eq('id', existingLead.id)
    } else {
      const { data: newLead } = await supabaseAdmin.from('leads').insert({ ...leadFields, status: 'new_inquiry' }).select('id').single()
      if (newLead) {
        await supabaseAdmin.from('activity_logs').insert({ lead_id: newLead.id, action: 'lead_created', description: 'Lead created from WhatsApp', performed_by: 'ai_chatbot' })
        syncLeadToSheets(newLead as any).catch(() => {})
      }
    }
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const parts: string[] = []
  const lines = text.split('\n')
  let current = ''
  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen) { if (current) parts.push(current.trim()); current = line }
    else current = current ? current + '\n' + line : line
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export async function POST(req: NextRequest) {
  try {
    if (!isWatiConfigured()) return NextResponse.json({ received: true, status: 'WhatsApp integration not yet configured.' })

    const rawBody = await req.text()
    const signature = req.headers.get('x-wati-signature') || ''
    if (process.env.WATI_WEBHOOK_SECRET) {
      const { verifyWatiWebhook } = await import('@/lib/whatsapp')
      if (!verifyWatiWebhook(rawBody, signature)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload: WatiWebhookPayload = JSON.parse(rawBody)
    if (payload.type !== 'message' || !payload.messages?.length) return NextResponse.json({ received: true })

    for (const msg of payload.messages) {
      handleIncomingMessage(payload.waId, payload.senderName, msg).catch(err => logger.error('whatsapp-webhook', 'handleIncomingMessage error', err))
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    logger.error('whatsapp-webhook', 'Webhook error', err)
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const challenge = searchParams.get('hub.challenge')
  const verifyToken = searchParams.get('hub.verify_token')

  if (verifyToken === process.env.WATI_VERIFY_TOKEN) return new NextResponse(challenge || 'verified', { status: 200 })

  return NextResponse.json({ status: 'WhatsApp webhook endpoint ready', configured: isWatiConfigured(), business_number: '8274844343', note: 'Set WATI_BASE_URL, WATI_API_TOKEN, and WATI_VERIFY_TOKEN to activate' })
}
