// src/app/api/cron/followups/route.ts
// Vercel Cron Job — fires every hour, sends pending WhatsApp follow-ups.
//
// Secured via CRON_SECRET bearer token.
// Vercel automatically sends Authorization: Bearer <CRON_SECRET> for cron routes.
//
// follow_ups table columns (verified from information_schema):
//   id, lead_id, type, message, status, scheduled_at, sent_at, created_at

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { smartSend }                 from '@/lib/queue'
import { WHATSAPP_MESSAGES }         from '@/lib/templates'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 30

// ─── Failure record shape ─────────────────────────────────────
interface FailureRecord {
  followup_id: string
  lead_id:     string | null
  phone:       string | null
  reason:      string
}

export async function GET(request: NextRequest) {

  // ─── 1. Auth ─────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()
    if (token !== cronSecret) {
      console.warn('[Cron/followups] Unauthorized request — bad or missing CRON_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  console.log('[Cron/followups] ── START ──────────────────────────────────')

  // ─── 2. Init DB ───────────────────────────────────────────────
  let db: ReturnType<typeof getSupabaseAdmin>
  try {
    db = getSupabaseAdmin()
    console.log('[Cron/followups] Supabase admin client ready')
  } catch (initErr) {
    const msg = initErr instanceof Error ? initErr.message : String(initErr)
    console.error('[Cron/followups] Supabase init failed:', msg)
    return NextResponse.json({ error: 'Supabase init failed', message: msg }, { status: 500 })
  }

  const now = new Date().toISOString()
  console.log('[Cron/followups] Processing at:', now)

  // ─── 3. Verify follow_ups table exists ────────────────────────
  const { error: tableCheckError } = await db
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .limit(1)

  if (tableCheckError) {
    console.error('[Cron/followups] follow_ups table check failed:', tableCheckError)
    return NextResponse.json({
      error:   'follow_ups table unreachable',
      message: tableCheckError.message,
      code:    tableCheckError.code,
      details: tableCheckError.details,
      hint:    tableCheckError.hint,
      fix:     'Run 007_missing_tables.sql in Supabase SQL Editor',
    }, { status: 500 })
  }

  // ─── 4. Fetch due WhatsApp follow-ups ─────────────────────────
  console.log('[Cron/followups] Querying due follow-ups...')

  const { data: dueFollowUps, error: fetchError } = await db
    .from('follow_ups')
    .select(`
      id,
      lead_id,
      message,
      scheduled_at,
      leads (
        id,
        name,
        phone,
        whatsapp_opted_in
      )
    `)
    .eq('status', 'pending')
    .eq('type',   'whatsapp')
    .lte('scheduled_at', now)
    .limit(50)

  if (fetchError) {
    console.error('[Cron/followups] Fetch error:', fetchError)
    return NextResponse.json({
      error:   'DB fetch error',
      message: fetchError.message,
      code:    fetchError.code,
      details: fetchError.details,
      hint:    fetchError.hint,
    }, { status: 500 })
  }

  const count = dueFollowUps?.length ?? 0
  console.log('[Cron/followups] Due follow-ups found:', count)

  if (count === 0) {
    console.log('[Cron/followups] Nothing to process.')
    return NextResponse.json({ processed: 0, message: 'No due follow-ups' })
  }

  // ─── 5. Process each follow-up ────────────────────────────────
  let sent    = 0
  let skipped = 0
  let failed  = 0
  const failures: FailureRecord[] = []

  for (const followUp of dueFollowUps!) {

    // Supabase returns the related row as an object when the FK is
    // on this table (follow_ups.lead_id → leads.id). Defensive cast
    // handles both object and single-element array shapes.
    const rawLead = followUp.leads
    const lead = (
      Array.isArray(rawLead) ? rawLead[0] : rawLead
    ) as {
      id:                string
      name:              string | null
      phone:             string | null
      whatsapp_opted_in: boolean | null
    } | null

    console.log(`[Cron/followups] ── follow-up ${followUp.id}`)
    console.log(`[Cron/followups]    lead_id   : ${followUp.lead_id}`)
    console.log(`[Cron/followups]    lead.phone: ${lead?.phone ? lead.phone.slice(0, 4) + '***' : 'null'}`)
    console.log(`[Cron/followups]    opted_in  : ${lead?.whatsapp_opted_in ?? 'null'}`)
    console.log(`[Cron/followups]    scheduled : ${followUp.scheduled_at}`)

    // ── Guard: skip if unusable ──────────────────────────────────
    if (!lead) {
      const reason = 'lead record not found (FK lookup returned null)'
      console.warn(`[Cron/followups] SKIP ${followUp.id}: ${reason}`)
      await db.from('follow_ups').update({ status: 'skipped' }).eq('id', followUp.id)
      failures.push({ followup_id: followUp.id, lead_id: followUp.lead_id, phone: null, reason })
      skipped++
      continue
    }

    if (!lead.phone) {
      const reason = 'lead has no phone number'
      console.warn(`[Cron/followups] SKIP ${followUp.id}: ${reason}`)
      await db.from('follow_ups').update({ status: 'skipped' }).eq('id', followUp.id)
      failures.push({ followup_id: followUp.id, lead_id: lead.id, phone: null, reason })
      skipped++
      continue
    }

    if (lead.whatsapp_opted_in === false) {
      const reason = 'lead has whatsapp_opted_in = false'
      console.warn(`[Cron/followups] SKIP ${followUp.id}: ${reason}`)
      await db.from('follow_ups').update({ status: 'skipped' }).eq('id', followUp.id)
      failures.push({ followup_id: followUp.id, lead_id: lead.id, phone: lead.phone, reason })
      skipped++
      continue
    }

    // ── Send ─────────────────────────────────────────────────────
    const message = WHATSAPP_MESSAGES.followUp(lead.name ?? undefined)

    console.log(`[Cron/followups] Calling smartSend for follow-up ${followUp.id}`)
    console.log(`[Cron/followups]   message preview: ${message.slice(0, 80)}`)

    const ok = await smartSend(lead.phone, message, { forceSpamCheck: true })

    console.log(`[Cron/followups] smartSend result: ${ok}`)

    if (ok) {
      // Mark sent
      const { error: completeErr } = await db
        .from('follow_ups')
        .update({ status: 'completed', sent_at: now })
        .eq('id', followUp.id)

      if (completeErr) {
        console.error(`[Cron/followups] Failed to mark completed for ${followUp.id}:`, completeErr.message)
      }

      // Update lead contact timestamps
      const { error: leadErr } = await db
        .from('leads')
        .update({
          last_contacted_at:        now,
          whatsapp_last_message_at: now,
        })
        .eq('id', lead.id)

      if (leadErr) {
        console.error(`[Cron/followups] Failed to update lead timestamps for ${lead.id}:`, leadErr.message)
      }

      sent++
      console.log(`[Cron/followups] ✓ Sent follow-up ${followUp.id}`)

    } else {
      // smartSend returned false — actual error is logged inside whatsapp.ts
      const reason = 'smartSend returned false — see Meta API logs above this line'
      console.error(`[Cron/followups] ✗ Failed follow-up ${followUp.id}: ${reason}`)
      failures.push({ followup_id: followUp.id, lead_id: lead.id, phone: lead.phone.slice(0, 4) + '***', reason })
      failed++
      // Leave status as 'pending' — will retry on next hourly cron run
    }
  }

  console.log(`[Cron/followups] ── DONE — processed=${count} sent=${sent} skipped=${skipped} failed=${failed}`)

  return NextResponse.json({
    processed: count,
    sent,
    skipped,
    failed,
    ...(failures.length > 0 && { failures }),
  })
}
