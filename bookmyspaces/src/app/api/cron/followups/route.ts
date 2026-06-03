// src/app/api/cron/followups/route.ts
// Vercel Cron Job — processes pending WhatsApp follow-ups
//
// Triggered by vercel.json crons config every hour.
// Secured by CRON_SECRET bearer token.
//
// What it does:
//   1. Fetches follow_ups WHERE status='pending' AND scheduled_at <= NOW() AND type='whatsapp'
//   2. Joins to leads to get phone, name, whatsapp_opted_in
//   3. Sends via smartSend() — respects existing rate limiting + spam checks
//   4. Marks follow_up as 'completed' or 'skipped'
//   5. Updates lead.last_contacted_at on success

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'
import { smartSend }                 from '@/lib/queue'
import { WHATSAPP_MESSAGES }         from '@/lib/templates'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  // ─── Auth: verify CRON_SECRET ──────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    const token      = authHeader?.replace('Bearer ', '').trim()
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const db  = getSupabaseAdmin()
  const now = new Date().toISOString()

  // ─── Fetch due WhatsApp follow-ups ─────────────────────────
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
    .limit(50) // cap per cron run to stay within maxDuration

  if (fetchError) {
    console.error('[Cron/followups] DB fetch error:', fetchError)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!dueFollowUps || dueFollowUps.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No due follow-ups' })
  }

  let sent    = 0
  let skipped = 0
  let failed  = 0

  for (const followUp of dueFollowUps) {
    const lead = (Array.isArray(followUp.leads) ? followUp.leads[0] : followUp.leads) as {
      id:                 string
      name:               string | null
      phone:              string | null
      whatsapp_opted_in:  boolean | null
    } | null

    // Skip if no lead, no phone, or opted out
    if (!lead?.phone || lead.whatsapp_opted_in === false) {
      await db
        .from('follow_ups')
        .update({ status: 'skipped', completed_at: now, updated_at: now })
        .eq('id', followUp.id)
      skipped++
      continue
    }

    const message = WHATSAPP_MESSAGES.followUp(lead.name ?? undefined)

    const ok = await smartSend(lead.phone, message, {
      forceSpamCheck: true, // prevent double-send within 60 min
    })

    if (ok) {
      // Mark follow-up complete
      await db
        .from('follow_ups')
        .update({ status: 'completed', completed_at: now, updated_at: now })
        .eq('id', followUp.id)

      // Update lead timestamps
      await db
        .from('leads')
        .update({
          last_contacted_at:        now,
          whatsapp_last_message_at: now,
          updated_at:               now,
        })
        .eq('id', lead.id)

      sent++
    } else {
      // smartSend returned false — rate limited or Meta not configured
      // Leave as pending so it retries next cron run
      await db
        .from('follow_ups')
        .update({ updated_at: now })
        .eq('id', followUp.id)

      failed++
    }
  }

  console.log(`[Cron/followups] sent=${sent} skipped=${skipped} failed=${failed}`)

  return NextResponse.json({
    processed: dueFollowUps.length,
    sent,
    skipped,
    failed,
  })
}
