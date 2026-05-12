export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildSegment, generateFestivalMessage, generateCampaignMessage, getUpcomingFestivals } from '@/lib/campaigns'

// GET — list campaigns + upcoming festivals
export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'campaigns'

    if (view === 'festivals') {
      const festivals = await getUpcomingFestivals(60)
      return NextResponse.json({ festivals })
    }

    const { data: campaigns, error, count } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ campaigns: campaigns || [], total: count })
  } catch (err) {
    logger.error('campaigns', 'GET /api/campaigns error', err)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

// POST — create, preview, or send campaign
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const {
      action,
      name,
      type,
      segment,
      message_template,
      template_name,
      campaign_id,
      festival,
      offer_details,
      context,
      tone,
      dry_run = true,
    } = body

    if (action === 'generate_festival') {
      const msg = await generateFestivalMessage(festival || 'Festival', offer_details)
      return NextResponse.json({ message: msg })
    }

    if (action === 'generate_message') {
      const msg = await generateCampaignMessage(type || 'promotional', context || '', tone || 'warm')
      return NextResponse.json({ message: msg })
    }

    if (action === 'preview') {
      const recipients = await buildSegment(segment || {})
      return NextResponse.json({
        count: recipients.length,
        sample: recipients.slice(0, 5).map(r => ({ name: r.name, phone: r.phone, status: r.status, score: r.ai_score })),
      })
    }

    if (action === 'create') {
      const recipients = await buildSegment(segment || {})

      const { data: campaign, error } = await supabaseAdmin
        .from('broadcast_campaigns')
        .insert({
          name: name || `Campaign ${new Date().toLocaleDateString('en-IN')}`,
          type: type || 'custom',
          segment: segment || {},
          message_template,
          template_name,
          recipient_count: recipients.length,
          status: 'draft',
        })
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ campaign }, { status: 201 })
    }

    if (action === 'send' && campaign_id) {
      const { data: campaign } = await supabaseAdmin
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single()

      if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

      const recipients = await buildSegment(campaign.segment || {})

      if (dry_run) {
        return NextResponse.json({
          dry_run: true,
          count: recipients.length,
          sample: recipients.slice(0, 3).map(r => ({ name: r.name, phone: r.phone })),
        })
      }

      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ status: 'running', sent_at: new Date().toISOString() })
        .eq('id', campaign_id)

      const broadcastRecipients = recipients.map(r => ({
        whatsappNumber: r.phone!,
        message: campaign.message_template,
      }))

      let sent = 0, failed = 0

      const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
      for (const r of broadcastRecipients) {
        try {
          const ok = await sendWhatsAppMessage(r.whatsappNumber, campaign.message_template)
          if (ok) sent++
          else failed++
          await new Promise(resolve => setTimeout(resolve, 1200))
        } catch {
          failed++
        }
      }

      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ status: 'completed', sent_count: sent, failed_count: failed })
        .eq('id', campaign_id)

      return NextResponse.json({ success: true, sent, failed, total: recipients.length })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    logger.error('campaigns', 'POST /api/campaigns error', err)
    return NextResponse.json({ error: 'Campaign operation failed' }, { status: 500 })
  }
}

// PATCH — update campaign
export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('broadcast_campaigns')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ campaign: data })
  } catch (err) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
