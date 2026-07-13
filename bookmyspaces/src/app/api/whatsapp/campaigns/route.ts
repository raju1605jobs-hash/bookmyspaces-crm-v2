export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { sendBroadcastCampaign } from '@/lib/whatsapp/send-message'
import { APPROVED_TEMPLATES, TEMPLATE_PARAMS } from '@/lib/templates'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { data } = await supabaseAdmin.from('broadcast_campaigns').select('*').order('created_at', { ascending: false }).limit(20)
    return NextResponse.json({ campaigns: data || [] })
  } catch {
    return NextResponse.json({ campaigns: [] })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { type, segment, dryRun = false } = body

    let query = supabaseAdmin.from('leads').select('id, name, phone, email, event_date, status, last_contacted_at').not('phone', 'is', null)
    if (segment && segment !== 'all') query = query.eq('status', segment)
    if (type === 'followup') {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`)
    }

    const { data: leads, error } = await query.limit(500)
    if (error) throw error
    if (!leads?.length) return NextResponse.json({ success: true, message: 'No eligible recipients', count: 0 })

    if (dryRun) return NextResponse.json({ success: true, dryRun: true, count: leads.length, sample: leads.slice(0, 5).map(l => ({ name: l.name, phone: l.phone })) })

    const recipients = leads.filter(l => l.phone).map(l => ({
      whatsappNumber: l.phone!,
      customParams: type === 'followup' ? TEMPLATE_PARAMS.followup(l.name || 'there', 'BookMySpaces') : type === 'review_request' ? TEMPLATE_PARAMS.reviewRequest(l.name || 'there', l.event_date || '') : undefined,
    }))

    let templateName = APPROVED_TEMPLATES.INQUIRY_FOLLOWUP
    if (type === 'festival') templateName = APPROVED_TEMPLATES.FESTIVAL_PROMO
    if (type === 'reengagement') templateName = APPROVED_TEMPLATES.REENGAGEMENT
    if (type === 'review_request') templateName = APPROVED_TEMPLATES.REVIEW_REQUEST

    const result = await sendBroadcastCampaign(recipients, templateName, `${type}_${new Date().toISOString().split('T')[0]}`)

    try {
      await supabaseAdmin.from('broadcast_campaigns').insert({ name: `${type}_campaign_${new Date().toISOString().split('T')[0]}`, type, channel: 'whatsapp', segment: typeof segment === 'string' ? { status: segment } : (segment || {}), template_name: templateName, message_template: templateName, recipient_count: leads.length, sent_count: result.success, failed_count: result.failed, status: 'completed', sent_at: new Date().toISOString() })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, type, sent: result.success, failed: result.failed, total: leads.length })
  } catch (err) {
    logger.error('whatsapp-campaigns', 'Campaign failed', err)
    return NextResponse.json({ error: 'Campaign failed' }, { status: 500 })
  }
}
