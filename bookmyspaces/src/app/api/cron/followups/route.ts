// src/app/api/cron/followups/route.ts
// Vercel Cron Job — processes pending WhatsApp follow-ups

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { smartSend }                 from '@/lib/queue'
import { WHATSAPP_MESSAGES }         from '@/lib/templates'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 30

export async function GET(request: NextRequest) {

  // ─── 1. Auth ─────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ─── 2. Init DB ───────────────────────────────────────────────
  let db: ReturnType<typeof getSupabaseAdmin>
  try {
    db = getSupabaseAdmin()
    console.log('[Cron/followups] Supabase admin client initialised')
  } catch (initErr) {
    console.error('[Cron/followups] Failed to initialise Supabase admin:', initErr)
    return NextResponse.json({
      error:   'Supabase init failed',
      message: initErr instanceof Error ? initErr.message : String(initErr),
    }, { status: 500 })
  }

  const now = new Date().toISOString()

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

  // ─── 4. Fetch due follow-ups ──────────────────────────────────
  console.log('[Cron/followups] Fetching due follow-ups, now =', now)

  const { data: dueFollowUps, error: fetchError } = await db
    .from('follow_ups')
    .select(`
      id,
      lead_id,
      notes,
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

  console.log('[Cron/followups] Fetch result — count:', dueFollowUps?.length ?? 0, '| error:', fetchError ?? 'none')

  if (fetchError) {
    console.error('[Cron/followups] Fetch error detail:', fetchError)
    return NextResponse.json({
      error:   'DB error',
      message: fetchError.message,
      code:    fetchError.code,
      details: fetchError.details,
      hint:    fetchError.hint,
    }, { status: 500 })
  }

  if (!dueFollowUps || dueFollowUps.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No due follow-ups' })
  }

  // ─── 5. Process each follow-up ────────────────────────────────
  let sent    = 0
  let skipped = 0
  let failed  = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (const followUp of dueFollowUps) {
    const rawLead = followUp.leads
    const lead = (
      Array.isArray(rawLead) ? rawLead[0] : rawLead
    ) as {
      id:                string
      name:              string | null
      phone:             string | null
      whatsapp_opted_in: boolean | null
    } | null

    console.log(
      `[Cron/followups] Processing id=${followUp.id}`,
      `phone=${lead?.phone ? lead.phone.slice(0, 4) + '***' : 'null'}`,
      `opted_in=${lead?.whatsapp_opted_in ?? 'null'}`,
    )

    // Skip: no lead attached, no phone, or explicitly opted out
    if (!lead?.phone || lead.whatsapp_opted_in === false) {
      const reason = !lead ? 'no lead record' : !lead.phone ? 'no phone' : 'opted out'
      console.log(`[Cron/followups] Skipping ${followUp.id} — ${reason}`)
      const { error: skipErr } = await db
        .from('follow_ups')
        .update({ status: 'skipped', completed_at: now })
        .eq('id', followUp.id)
      if (skipErr) console.error('[Cron/followups] Skip update error:', skipErr)
      skipped++
      continue
    }

    const message = WHATSAPP_MESSAGES.followUp(lead.name ?? undefined)
    console.log(`[Cron/followups] Calling smartSend for follow-up ${followUp.id}`)

    const ok = await smartSend(lead.phone, message, { forceSpamCheck: true })
    console.log(`[Cron/followups] smartSend result for ${followUp.id}:`, ok)

    if (ok) {
      const { error: completeErr } = await db
        .from('follow_ups')
        .update({ status: 'completed', completed_at: now })
        .eq('id', followUp.id)
      if (completeErr) console.error('[Cron/followups] Complete update error:', completeErr)

      const { error: leadErr } = await db
        .from('leads')
        .update({ last_contacted_at: now, whatsapp_last_message_at: now })
        .eq('id', lead.id)
      if (leadErr) console.error('[Cron/followups] Lead timestamp update error:', leadErr)

      sent++
    } else {
      // smartSend returned false — see whatsapp.ts console logs for exact Meta error
      const reason = 'smartSend returned false — check Vercel logs for Meta API error'
      console.error(`[Cron/followups] Send failed for ${followUp.id}: ${reason}`)
      failures.push({ id: followUp.id, reason })
      failed++
    }
  }

  console.log(`[Cron/followups] Done — sent=${sent} skipped=${skipped} failed=${failed}`)

  return NextResponse.json({
    processed: dueFollowUps.length,
    sent,
    skipped,
    failed,
    // Surfaced in response so failures are visible without Vercel log access
    ...(failures.length > 0 && { failures }),
  })
}
