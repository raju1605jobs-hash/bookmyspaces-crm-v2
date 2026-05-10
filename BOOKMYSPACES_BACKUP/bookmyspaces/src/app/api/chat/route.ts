import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  chatWithAI,
  extractLeadFromTag,
  extractLeadViaAI,
  mergeExtracted,
  cleanAIResponse,
  hasMinimumLeadData,
  generateConversationSummary,
  parseGuestCount,
  parseEventDate,
  sanitizeString,
  Message,
  ExtractedLeadData,
} from '@/lib/ai'
import { supabaseAdmin } from '@/lib/supabase'
import { syncLeadToSheets, initializeSheet } from '@/lib/sheets'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 30

// ─────────────────────────────────────────
// POST /api/chat
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const reqId = uuidv4().slice(0, 8) // short ID for log correlation

  try {
    const body = await req.json()
    const { message, sessionId: incomingSessionId } = body

    // ── Input validation ──────────────────────────────────
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const trimmedMessage = message.trim().slice(0, 2000)
    if (!trimmedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    // ── Session management ────────────────────────────────
    const sessionId =
      incomingSessionId && /^[0-9a-f-]{36}$/.test(incomingSessionId)
        ? incomingSessionId
        : uuidv4()

    logger.info('chat', `[${reqId}] Request received`, { sessionId, messageLen: trimmedMessage.length })

    // ── Load existing conversation ────────────────────────
    const { data: existingConv, error: convFetchError } = await supabaseAdmin
      .from('conversations')
      .select('id, messages, lead_id, extracted_phone')
      .eq('session_id', sessionId)
      .maybeSingle()

    if (convFetchError) {
      logger.error('chat', `[${reqId}] Conversation fetch error`, convFetchError)
      // Non-fatal — proceed with empty history
    }

    const existingMessages: Message[] = Array.isArray(existingConv?.messages)
      ? (existingConv!.messages as Message[]).slice(-18)
      : []

    const conversationId: string | null = existingConv?.id || null
    const existingLeadId: string | null = existingConv?.lead_id || null

    logger.debug('chat', `[${reqId}] Conversation loaded`, {
      conversationId: conversationId || 'new',
      existingLeadId: existingLeadId || 'none',
      historyLength: existingMessages.length,
    })

    // ── Build messages for AI ─────────────────────────────
    const messagesForAI: Message[] = [
      ...existingMessages,
      { role: 'user' as const, content: trimmedMessage },
    ]

    // ── Call AI ───────────────────────────────────────────
    logger.debug('chat', `[${reqId}] Calling AI`, { turns: messagesForAI.length })
    const aiResponseRaw = await chatWithAI(messagesForAI, trimmedMessage)
    const aiResponseClean = cleanAIResponse(aiResponseRaw)

    logger.debug('chat', `[${reqId}] AI responded`, {
      responseLen: aiResponseClean.length,
      hasTag: aiResponseRaw.includes('<<LEAD:'),
    })

    // ── Dual extraction strategy ──────────────────────────
    const fromTag = extractLeadFromTag(aiResponseRaw)

    logger.debug('chat', `[${reqId}] Tag extraction result`, {
      hasName: !!fromTag?.name,
      hasPhone: !!fromTag?.phone,
      hasEventType: !!fromTag?.event_type,
    })

    // Run AI extraction as fallback only if tag gave no usable data
    // AND we have enough conversation to extract from
    let fromAI: ExtractedLeadData | null = null
    if (!hasMinimumLeadData(fromTag) && existingMessages.length >= 0) {
      logger.debug('chat', `[${reqId}] Running AI fallback extraction`)
      const convText = messagesForAI
        .map(m => `${m.role === 'user' ? 'Customer' : 'Aria'}: ${m.content}`)
        .join('\n')
      fromAI = await extractLeadViaAI(convText)
      logger.debug('chat', `[${reqId}] AI extraction result`, {
        hasName: !!fromAI?.name,
        hasPhone: !!fromAI?.phone,
      })
    }

    const extracted = mergeExtracted(fromTag, fromAI)
    const hasLead = hasMinimumLeadData(extracted)

    logger.info('chat', `[${reqId}] Extraction complete`, {
      hasMinimumData: hasLead,
      name: extracted?.name || null,
      phone: extracted?.phone || null,
      eventType: extracted?.event_type || null,
    })

    // ── Build updated messages (cap at 40) ────────────────
    const updatedMessages: Message[] = [
      ...messagesForAI,
      { role: 'assistant' as const, content: aiResponseClean },
    ].slice(-40)

    // ── Upsert conversation ───────────────────────────────
    const convPayload: Record<string, unknown> = {
      session_id: sessionId,
      messages: updatedMessages,
      // 'channel' omitted — column has DEFAULT 'website' in schema.
      // PostgREST schema cache may not yet reflect this column;
      // fix: go to Supabase Dashboard → API → Reload schema cache.
      is_active: true,
    }

    // Only set extracted fields when we have non-null values
    // (preserves previously captured data if current turn has nothing new)
    if (extracted?.name) convPayload.extracted_name = extracted.name
    if (extracted?.phone) convPayload.extracted_phone = extracted.phone
    if (extracted?.email) convPayload.extracted_email = extracted.email
    if (extracted?.event_type) convPayload.extracted_event_type = extracted.event_type
    if (extracted?.event_date) convPayload.extracted_event_date = extracted.event_date
    if (extracted?.guest_count) convPayload.extracted_guest_count = extracted.guest_count
    if (extracted?.budget) convPayload.extracted_budget = extracted.budget

    let currentConversationId = conversationId

    if (conversationId) {
      const { error: updateErr } = await supabaseAdmin
        .from('conversations')
        .update(convPayload)
        .eq('id', conversationId)

      if (updateErr) {
        logger.error('chat', `[${reqId}] Conversation UPDATE failed`, updateErr, { conversationId })
      } else {
        logger.debug('chat', `[${reqId}] Conversation updated`, { conversationId })
      }
    } else {
      const { data: newConv, error: insertErr } = await supabaseAdmin
        .from('conversations')
        .upsert(convPayload, { onConflict: 'session_id', ignoreDuplicates: false })
        .select('id')
        .single()

      if (insertErr) {
        logger.error('chat', `[${reqId}] Conversation UPSERT failed`, insertErr, {
          payload_keys: Object.keys(convPayload).join(','),
          session_id: sessionId,
          error_code: (insertErr as any).code,
          error_details: (insertErr as any).details,
          error_hint: (insertErr as any).hint,
        })
        // Attempt plain fetch as fallback — maybe it was inserted despite the error
        const { data: fallback } = await supabaseAdmin
          .from('conversations')
          .select('id')
          .eq('session_id', sessionId)
          .maybeSingle()
        if (fallback?.id) {
          currentConversationId = fallback.id
          logger.info('chat', `[${reqId}] Conversation recovered via fallback fetch`, { conversationId: currentConversationId })
        }
      } else {
        currentConversationId = newConv?.id || null
        logger.info('chat', `[${reqId}] Conversation upserted`, { conversationId: currentConversationId })
      }
    }

    // ── Lead upsert ───────────────────────────────────────
    let leadId: string | null = existingLeadId

    if (hasLead) {
      // Case A: We have name or phone — full upsert
      logger.info('chat', `[${reqId}] Upserting lead`)
      leadId = await upsertLead(
        extracted!,
        existingLeadId,
        extracted?.phone || existingConv?.extracted_phone || null,
        currentConversationId,
        reqId
      )
      logger.info('chat', `[${reqId}] Lead upsert complete`, { leadId })
    } else if (!existingLeadId && !leadId && currentConversationId && extracted) {
      // Case B: Have some signal (event_type/budget) but no name/phone yet
      // Create a minimal stub lead so the conversation is tracked in CRM
      const hasAnySignal = !!(extracted.event_type || extracted.budget || extracted.guest_count || extracted.venue)
      if (hasAnySignal) {
        logger.info('chat', `[${reqId}] Creating stub lead from partial extraction`)
        leadId = await upsertLead(extracted, null, null, currentConversationId, reqId)
      }
    }

    // ── Link lead to conversation ─────────────────────────
    if (leadId && !existingLeadId && currentConversationId) {
      const { error: linkErr } = await supabaseAdmin
        .from('conversations')
        .update({ lead_id: leadId })
        .eq('id', currentConversationId)

      if (linkErr) {
        logger.error('chat', `[${reqId}] Lead-conversation link failed`, linkErr)
      } else {
        logger.debug('chat', `[${reqId}] Lead linked to conversation`, { leadId, conversationId: currentConversationId })
      }
    }

    // ── Async: generate summary every 10 messages ─────────
    if (updatedMessages.length > 0 && updatedMessages.length % 10 === 0 && currentConversationId) {
      const convIdForSummary = currentConversationId
      generateConversationSummary(updatedMessages)
        .then(async (summary) => {
          const { error } = await supabaseAdmin
            .from('conversations')
            .update({ summary })
            .eq('id', convIdForSummary)
          if (error) logger.error('chat', 'Summary update failed', error)
        })
        .catch(() => {}) // truly non-fatal
    }

    return NextResponse.json({
      reply: aiResponseClean,
      sessionId,
      leadCaptured: hasLead,
    })

  } catch (error) {
    logger.error('chat', `[${reqId}] Unhandled error`, error)
    return NextResponse.json(
      {
        reply: "I'm having trouble connecting right now. Please WhatsApp us at 9051459463 and we'll respond right away! 😊",
        error: 'Internal server error',
        sessionId: null,
      },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────
// LEAD UPSERT — Deduplicated, safe, fully logged
// ─────────────────────────────────────────
// DEDUP UTILITIES
// ─────────────────────────────────────────
/** Normalize Indian phone: strip spaces/hyphens/+, remove leading 91 → 10 digits */
function normalizePhoneForDedup(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[\s\-\+\(\)]/g, '')
  // Strip leading country code variants: 91, 0091
  const stripped = digits.replace(/^(0091|91)([6-9]\d{9})$/, '$2')
  return /^[6-9]\d{9}$/.test(stripped) ? stripped : null
}

/** Normalize email: lowercase + trim */
function normalizeEmailForDedup(raw: string | null | undefined): string | null {
  if (!raw) return null
  const e = raw.trim().toLowerCase()
  return e.includes('@') ? e : null
}

// Priority chain: existingLeadId → phone match → create new
// ─────────────────────────────────────────
async function upsertLead(
  extracted: ExtractedLeadData,
  existingLeadId: string | null,
  phone: string | null,
  conversationId: string | null,
  reqId: string
): Promise<string | null> {
  try {
    const guestCount = parseGuestCount(extracted.guest_count)
    const eventDate = parseEventDate(extracted.event_date)

    // Base fields for both insert and update
    const baseFields: Record<string, unknown> = {
      ...(extracted.name && { name: sanitizeString(extracted.name) }),
      ...(phone && { phone }),
      ...(extracted.email && { email: sanitizeString(extracted.email) }),
      ...(extracted.event_type && { event_type: sanitizeString(extracted.event_type) }),
      // event_date and last_contacted_at omitted — PGRST204 schema cache issue.
      // After reloading Supabase schema cache these can be restored.
      ...(guestCount && { guest_count: guestCount }),
      ...(extracted.budget && { budget: sanitizeString(extracted.budget) }),
      ...(extracted.venue && { venue: sanitizeString(extracted.venue) }),
    }

    // ── Case 1: Known lead from this session ──────────────
    if (existingLeadId) {
      const { error } = await supabaseAdmin
        .from('leads')
        .update(baseFields)
        .eq('id', existingLeadId)

      if (error) {
        logger.error('chat', `[${reqId}] Lead update failed`, error, { leadId: existingLeadId })
        return existingLeadId // return ID even if update failed — lead exists
      }

      logger.debug('chat', `[${reqId}] Existing lead updated`, { leadId: existingLeadId })
      // Sync to Sheets on first update if not yet synced
      console.log('[SHEETS-TRACE] Case1 — syncing existing lead', existingLeadId)
      syncLeadToSheets({ id: existingLeadId })
        .then(ok => console.log('[SHEETS-TRACE] Case1 sync result:', ok))
        .catch(() => {})
      return existingLeadId
    }

    // ── Case 2: Deduplication by normalized phone → normalized email ──
    const normPhone = normalizePhoneForDedup(phone)
    const normEmail = normalizeEmailForDedup(sanitizeString(extracted.email))

    // 2a: match by normalized phone (handles +91, spaces, hyphens, country code)
    let dupLeadId: string | null = null
    let dupReason = ''

    if (normPhone) {
      // Fetch leads where last 10 digits match — covers all phone format variants
      const { data: phoneRows } = await supabaseAdmin
        .from('leads')
        .select('id, phone')
        .not('phone', 'is', null)
        .limit(500)

      const phoneMatch = (phoneRows ?? []).find((r: any) => {
        const norm = normalizePhoneForDedup(r.phone)
        return norm && norm === normPhone
      })
      if (phoneMatch) { dupLeadId = phoneMatch.id; dupReason = 'phone' }
    }

    // 2b: fallback — match by normalized email if phone dedup found nothing
    if (!dupLeadId && normEmail) {
      const { data: emailMatch } = await supabaseAdmin
        .from('leads')
        .select('id')
        .ilike('email', normEmail)
        .maybeSingle()
      if (emailMatch) { dupLeadId = emailMatch.id; dupReason = 'email' }
    }

    if (dupLeadId) {
      const { error: updateErr } = await supabaseAdmin
        .from('leads')
        .update(baseFields)
        .eq('id', dupLeadId)

      if (updateErr) {
        logger.error('chat', `[${reqId}] Dedup lead update failed`, updateErr)
      } else {
        logger.info('chat', `[${reqId}] Duplicate prevented via ${dupReason} match`, { leadId: dupLeadId })
        // Activity log for dedup event
        Promise.resolve(supabaseAdmin.from('activity_logs').insert({
          lead_id: dupLeadId,
          action: 'duplicate_prevented',
          description: `Duplicate inquiry detected and merged (matched by ${dupReason})`,
          performed_by: 'ai_chatbot',
          metadata: { conversation_id: conversationId, req_id: reqId, match_method: dupReason },
        })).catch(() => {})
        // Sync updated row to Sheets
        syncLeadToSheets({ id: dupLeadId }).catch(() => {})
      }

      return dupLeadId
    }

    // ── Case 3: Create new lead ───────────────────────────
    // Guard: must have at least one meaningful field to save
    const hasAnything = !!(
      sanitizeString(extracted.name) || phone ||
      sanitizeString(extracted.event_type) || sanitizeString(extracted.budget) ||
      parseGuestCount(extracted.guest_count) || sanitizeString(extracted.venue)
    )
    if (!hasAnything) {
      logger.debug('chat', `[${reqId}] No meaningful data to save — skipping lead insert`)
      return null
    }

    // Build insert — omit columns not yet visible in PostgREST schema cache (PGRST204).
    // Fix in Supabase: Dashboard → API → Reload schema cache, then restore these fields.
    const leadInsertPayload: Record<string, unknown> = {
      name: sanitizeString(extracted.name),
      phone: phone || null,
      email: sanitizeString(extracted.email),
      event_type: sanitizeString(extracted.event_type),
      guest_count: guestCount,
      budget: sanitizeString(extracted.budget),
      venue: sanitizeString(extracted.venue),
      source: 'website',
      status: 'new_inquiry',
      // Store event_date as text note until schema cache is refreshed
      ...(eventDate ? { notes: `Event date: ${eventDate}` } : {}),
    }

    const { data: newLead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert(leadInsertPayload)
      .select('id')
      .single()

    if (insertError) {
      logger.error('chat', `[${reqId}] Lead INSERT failed`, insertError, {
        hasPhone: !!phone,
        hasName: !!extracted.name,
        eventDate,
        error_code: (insertError as any).code,
        error_message: (insertError as any).message,
        error_details: (insertError as any).details,
        error_hint: (insertError as any).hint,
      })
      return null
    }

    if (!newLead) {
      logger.error('chat', `[${reqId}] Lead insert returned no data`)
      return null
    }

    logger.info('chat', `[${reqId}] New lead created`, {
      leadId: newLead.id,
      hasPhone: !!phone,
      hasName: !!extracted.name,
    })

    // Log to activity_logs (non-fatal)
    supabaseAdmin.from('activity_logs').insert({
      lead_id: newLead.id,
      action: 'lead_created',
      description: 'Lead auto-created from website chatbot',
      performed_by: 'ai_chatbot',
      metadata: { conversation_id: conversationId, req_id: reqId },
    }).then(({ error }) => {
      if (error) logger.error('chat', `[${reqId}] activity_logs insert failed`, error)
    })

    // Google Sheets sync — fully async, never blocks response
    // Initialize sheet headers+formatting on first-ever lead (non-blocking)
    initializeSheet().catch(() => {})
    console.log('[SHEETS-TRACE] About to call syncLeadToSheets, leadId:', newLead.id)
    syncLeadToSheets(newLead as any)
      .then(ok => console.log('[SHEETS-TRACE] syncLeadToSheets resolved:', ok))
      .catch((err) => {
        console.log('[SHEETS-TRACE] syncLeadToSheets threw:', err?.message ?? err)
        logger.error('chat', `[${reqId}] Google Sheets sync failed`, err)
      })

    // Track analytics event — non-blocking, failure ignored
    Promise.resolve(supabaseAdmin.rpc('track_event', {
      p_event_type: 'lead_created',
      p_session_id: conversationId,
      p_lead_id: newLead.id,
      p_channel: 'website',
      p_properties: { has_phone: !!phone, has_name: !!extracted.name },
    })).catch(() => {}) // non-fatal

    return newLead.id

  } catch (err) {
    logger.error('chat', `[${reqId}] upsertLead threw`, err)
    return null
  }
}

// ─────────────────────────────────────────
// GET /api/chat — Health check
// ─────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: 'Chat API is running',
    timestamp: new Date().toISOString(),
  })
}
