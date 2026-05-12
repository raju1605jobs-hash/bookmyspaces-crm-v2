export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { sendBroadcastCampaign, sendTemplateMessage } from '@/lib/whatsapp'
import { APPROVED_TEMPLATES, TEMPLATE_PARAMS } from '@/lib/templates'

const supabaseAdmin = getSupabaseAdmin()

export const runtime = 'nodejs'
export const maxDuration = 120

// GET — list recent campaigns
export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ campaigns: data || [] })
  } catch {
    return NextResponse.json({ campaigns: [] })
  }
}

// POST — trigger a campaign
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      type,           // 'followup' | 'festival' | 'reengagement' | 'review_request'
      segment,        // 'all' | 'new_inquiry' | 'followup_pending' | 'future_prospect'
      customMessage,  // for session messages within 24h
      templateParams, // override template params
      dryRun = false, // if true, just count recipients
    } = body

    // ── Build recipient list ──
    let query = supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, event_date, status, last_contacted_at')
      .not('phone', 'is', null)

    if (segment && segment !== 'all') {
      query = query.eq('status', segment)
    }

    // For follow-up campaigns: only leads not contacted in 48h
    if (type === 'followup') {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`)
    }

    const { data: leads, error } = await query.limit(500) // safety cap

    if (error) throw error
    if (!leads?.length) {
      return NextResponse.json({ success: true, message: 'No eligible recipients', count: 0 })
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        count: leads.length,
        sample: leads.slice(0, 5).map(l => ({ name: l.name, phone: l.phone })),
      })
    }

    // ── Send campaign ──
    const recipients = leads
      .filter(l => l.phone)
      .map(l => ({
        whatsappNumber: l.phone!,
        customParams: type === 'followup'
          ? TEMPLATE_PARAMS.followup(l.name || 'there', 'BookMySpaces')
          : type === 'review_request'
          ? TEMPLATE_PARAMS.reviewRequest(l.name || 'there', l.event_date || '')
          : undefined,
      }))

    let templateName = APPROVED_TEMPLATES.INQUIRY_FOLLOWUP
    if (type === 'festival') templateName = APPROVED_TEMPLATES.FESTIVAL_PROMO
    if (type === 'reengagement') templateName = APPROVED_TEMPLATES.REENGAGEMENT
    if (type === 'review_request') templateName = APPROVED_TEMPLATES.REVIEW_REQUEST

    const result = await sendBroadcastCampaign(
      recipients,
      templateName,
      `${type}_${new Date().toISOString().split('T')[0]}`
    )

    // Log campaign
    try {
      await supabaseAdmin.from('broadcast_campaigns').insert({
        name: `${type}_campaign_${new Date().toISOString().split('T')[0]}`,
        type,
        channel: 'whatsapp',
        segment: typeof segment === 'string' ? { status: segment } : (segment || {}),
        template_name: templateName,
        message_template: templateName, // required NOT NULL
        recipient_count: leads.length,
        sent_count: result.success,
        failed_count: result.failed,
        status: 'completed',
        sent_at: new Date().toISOString(),
      })
    } catch {
      // campaigns table may not exist yet — non-critical
    }

    return NextResponse.json({
      success: true,
      type,
      sent: result.success,
      failed: result.failed,
      total: leads.length,
    })
  } catch (err) {
    logger.error('whatsapp-campaigns', 'Campaign failed', err)
    return NextResponse.json({ error: 'Campaign failed' }, { status: 500 })
  }
}
