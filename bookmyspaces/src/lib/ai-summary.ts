// ═══════════════════════════════════════════════════════════
// AI DAILY SUMMARY GENERATOR
// Produces an intelligent business summary every morning
// ═══════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabase'
import { smartSend } from './queue'

const supabaseAdmin = getSupabaseAdmin()

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
  return _anthropic
}

export interface DailySummaryData {
  date: string
  summary_text: string
  key_metrics: Record<string, number | string>
  action_items: string[]
  vip_leads: Array<{ name: string; phone: string; score: number; reason: string }>
  urgent_followups: Array<{ name: string; phone: string; hours: number }>
}

// ─────────────────────────────────────────
// GATHER YESTERDAY'S METRICS
// ─────────────────────────────────────────
async function gatherDailyMetrics() {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const todayStr = today.toISOString().split('T')[0]
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const [
    { data: newLeads },
    { data: confirmedLeads },
    { data: proposalsSent },
    { data: allActive },
    { data: vipLeads },
    { data: urgentFollowups },
    { data: conversations },
  ] = await Promise.all([
    // New leads today
    supabaseAdmin.from('leads').select('id, name, phone, event_type, source, ai_score, budget')
      .gte('created_at', todayStr).order('created_at', { ascending: false }),

    // Confirmed today
    supabaseAdmin.from('leads').select('id, name, budget')
      .eq('status', 'confirmed').gte('updated_at', todayStr),

    // Proposals sent today
    supabaseAdmin.from('proposals').select('id, client_name, total_price, package_name')
      .gte('sent_at', todayStr),

    // Active pipeline
    supabaseAdmin.from('leads').select('status').in('status', [
      'new_inquiry', 'followup_pending', 'proposal_sent', 'negotiation'
    ]),

    // VIP leads (high score, not yet confirmed)
    supabaseAdmin.from('leads').select('id, name, phone, ai_score, ai_score_reason, budget, event_type')
      .gte('ai_score', 7)
      .not('status', 'in', '("confirmed","rejected")')
      .order('ai_score', { ascending: false })
      .limit(5),

    // Urgent follow-ups (not contacted in 48h)
    supabaseAdmin.from('leads').select('id, name, phone, last_contacted_at, created_at')
      .in('status', ['new_inquiry', 'followup_pending'])
      .not('phone', 'is', null)
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${new Date(Date.now() - 48 * 3600000).toISOString()}`)
      .limit(10),

    // Today's conversations
    supabaseAdmin.from('conversations').select('id, channel')
      .gte('created_at', todayStr),
  ])

  return {
    todayStr,
    newLeads: newLeads || [],
    confirmedLeads: confirmedLeads || [],
    proposalsSent: proposalsSent || [],
    activePipeline: allActive?.length || 0,
    vipLeads: (vipLeads || []).map(l => ({
      name: l.name || 'Unknown',
      phone: l.phone || '',
      score: l.ai_score || 0,
      reason: l.ai_score_reason || '',
      budget: l.budget,
      event_type: l.event_type,
    })),
    urgentFollowups: (urgentFollowups || []).map(l => {
      const lastContact = l.last_contacted_at || l.created_at
      const hours = Math.floor((Date.now() - new Date(lastContact).getTime()) / 3600000)
      return { name: l.name || 'Unknown', phone: l.phone || '', hours }
    }),
    conversations: conversations || [],
  }
}

// ─────────────────────────────────────────
// GENERATE AI SUMMARY
// ─────────────────────────────────────────
export async function generateDailySummary(): Promise<DailySummaryData> {
  const metrics = await gatherDailyMetrics()

  const prompt = `You are a hospitality business intelligence AI for BookMySpaces, Kolkata.
Generate a crisp, actionable daily summary for the owner/manager.

TODAY'S DATA (${metrics.todayStr}):
- New Leads Today: ${metrics.newLeads.length}
  ${metrics.newLeads.map(l => `  • ${l.name || 'Unknown'} — ${l.event_type || 'inquiry'} (${l.source})`).join('\n')}

- Confirmed Bookings Today: ${metrics.confirmedLeads.length}
- Proposals Sent Today: ${metrics.proposalsSent.length}
  ${metrics.proposalsSent.map(p => `  • ${p.client_name} — ${p.package_name} (₹${p.total_price?.toLocaleString('en-IN')})`).join('\n')}

- Active Pipeline: ${metrics.activePipeline} leads
- AI Conversations Today: ${metrics.conversations.length}

VIP LEADS NEEDING ATTENTION (score 7+):
${metrics.vipLeads.map(l => `• ${l.name} (score ${l.score}/10) — ${l.event_type}, Budget: ${l.budget || 'unknown'}`).join('\n') || 'None'}

URGENT FOLLOW-UPS (48h+ no contact):
${metrics.urgentFollowups.map(l => `• ${l.name} — ${l.hours}h ago`).join('\n') || 'None'}

Write a WhatsApp-friendly morning summary. Format:
1. Good morning greeting (2 lines max)
2. Yesterday's wins (bullets)
3. Today's priorities (numbered, max 4)
4. VIP alerts if any
5. Closing motivational line

Keep it under 250 words. Use emojis naturally. Write in English with Indian warmth.`

  const response = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const summaryText = response.content[0].type === 'text'
    ? response.content[0].text
    : 'Good morning! Here is your daily summary.'

  // Generate action items separately
  const actionItems = [
    ...metrics.urgentFollowups.slice(0, 3).map(l => `Follow up with ${l.name} (${l.hours}h overdue)`),
    ...metrics.vipLeads.slice(0, 2).map(l => `Call VIP lead: ${l.name} (score ${l.score}/10)`),
    metrics.proposalsSent.length === 0 ? 'Create and send at least 1 proposal today' : null,
    metrics.newLeads.length > 5 ? 'High inquiry volume — seed knowledge base if chatbot quality drops' : null,
  ].filter(Boolean) as string[]

  const result: DailySummaryData = {
    date: metrics.todayStr,
    summary_text: summaryText,
    key_metrics: {
      new_leads: metrics.newLeads.length,
      confirmed: metrics.confirmedLeads.length,
      proposals_sent: metrics.proposalsSent.length,
      active_pipeline: metrics.activePipeline,
      vip_leads: metrics.vipLeads.length,
      urgent_followups: metrics.urgentFollowups.length,
      conversations: metrics.conversations.length,
    },
    action_items: actionItems,
    vip_leads: metrics.vipLeads,
    urgent_followups: metrics.urgentFollowups,
  }

  // Save to DB
  await supabaseAdmin.from('ai_summaries').upsert({
    date: metrics.todayStr,
    summary_text: summaryText,
    key_metrics: result.key_metrics,
    action_items: actionItems,
    vip_leads: metrics.vipLeads,
    urgent_followups: metrics.urgentFollowups,
  }, { onConflict: 'date' })

  return result
}

// ─────────────────────────────────────────
// SEND SUMMARY VIA WHATSAPP
// ─────────────────────────────────────────
export async function sendDailySummaryWhatsApp(summary: DailySummaryData): Promise<boolean> {
  const { data: setting } = await supabaseAdmin
    .from('notification_settings')
    .select('value')
    .eq('key', 'daily_summary_whatsapp')
    .single()

  const phone = setting?.value || process.env.NEXT_PUBLIC_BUSINESS_WHATSAPP
  if (!phone) return false

  const sent = await smartSend(phone, summary.summary_text, { type: 'session' })

  if (sent) {
    await supabaseAdmin
      .from('ai_summaries')
      .update({ sent_via_whatsapp: true })
      .eq('date', summary.date)
  }

  return sent
}

// ─────────────────────────────────────────
// VIP LEAD DETECTION
// ─────────────────────────────────────────
export async function detectAndFlagVIPLeads(): Promise<number> {
  // Get settings
  const { data: settings } = await supabaseAdmin
    .from('notification_settings')
    .select('key, value')
    .in('key', ['vip_threshold_score', 'vip_threshold_budget'])

  const thresholdScore = parseInt(
    settings?.find(s => s.key === 'vip_threshold_score')?.value || '8'
  )

  // Find leads that qualify as VIP but aren't flagged yet
  const { data: candidates } = await supabaseAdmin
    .from('leads')
    .select('id, name, ai_score, budget, event_type')
    .eq('is_vip', false)
    .gte('ai_score', thresholdScore)

  if (!candidates?.length) return 0

  let flagged = 0
  for (const lead of candidates) {
    const reasons: string[] = []
    if ((lead.ai_score || 0) >= thresholdScore) reasons.push(`High AI score: ${lead.ai_score}/10`)

    await supabaseAdmin
      .from('leads')
      .update({
        is_vip: true,
        vip_reason: reasons.join(', '),
      })
      .eq('id', lead.id)

    // Log it
    await supabaseAdmin.from('activity_logs').insert({
      lead_id: lead.id,
      action: 'vip_flagged',
      description: `any flagged as VIP: ${reasons.join(', ')}`,
      performed_by: 'ai_system',
    })

    flagged++
  }

  return flagged
}
