export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST — generate and store AI lead summary
export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    const [leadRes, convsRes, logsRes, propsRes] = await Promise.all([
      supabaseAdmin.from('leads').select('*').eq('id', lead_id).single(),
      supabaseAdmin.from('conversations').select('messages,summary,channel').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(3),
      supabaseAdmin.from('activity_logs').select('action,description,created_at').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('proposals').select('proposal_number,package_name,total_price,status').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(5),
    ])

    const lead = leadRes.data
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const convMessages = (convsRes.data || [])
      .flatMap((c: any) => (c.messages || []).slice(-20))
      .map((m: any) => `${m.role === 'user' ? 'Customer' : 'Aria'}: ${m.content}`)
      .join('\n')

    const activityText = (logsRes.data || [])
      .map((a: any) => `[${new Date(a.created_at).toLocaleDateString('en-IN')}] ${a.action}: ${a.description}`)
      .join('\n')

    const proposalText = (propsRes.data || [])
      .map((p: any) => `${p.proposal_number} — ${p.package_name} Rs${p.total_price?.toLocaleString('en-IN')} (${p.status})`)
      .join('\n')

    const context = `LEAD: ${lead.name || 'Unknown'} | Phone: ${lead.phone || '-'} | Email: ${lead.email || '-'}
Event: ${lead.event_type || '-'} | Date: ${lead.event_date || '-'} | Guests: ${lead.guest_count || '-'}
Budget: ${lead.budget || '-'} | Venue: ${lead.venue || '-'} | Source: ${lead.source}
Status: ${lead.status} | AI Score: ${lead.ai_score || lead.lead_score || '-'}/10
Notes: ${lead.notes || 'None'}

CONVERSATIONS:
${convMessages || 'No conversations recorded'}

ACTIVITY:
${activityText || 'No activity'}

PROPOSALS:
${proposalText || 'None created'}`

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a CRM analyst for BookMySpaces, a premium event venue in Kolkata.
Analyze this lead and return ONLY valid JSON, no explanation.

${context}

Return exactly:
{"event_type":"","estimated_budget":"","urgency":"high/medium/low","lead_quality":"hot/warm/cold","key_requirements":[],"objections":[],"conversion_likelihood":"high/medium/low","recommended_action":"","summary":"2-3 sentence plain English summary"}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]) } catch { parsed = { summary: text.slice(0, 300) } }

    // Store summary text on lead
    await supabaseAdmin.from('leads').update({
      inquiry_summary: (parsed.summary as string) || text.slice(0, 500)
    }).eq('id', lead_id)

    // Log activity
    await supabaseAdmin.from('activity_logs').insert({
      lead_id,
      action: 'ai_summary_generated',
      description: 'AI lead intelligence summary generated',
      performed_by: 'system',
      metadata: parsed,
    })

    return NextResponse.json({ summary: parsed })
  } catch (err) {
    logger.error('summary', 'AI summary failed', err)
    return NextResponse.json({ error: 'Summary generation failed' }, { status: 500 })
  }
}

// GET — fetch lead context (lead + conversations + activities + proposals)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const [leadRes, convsRes, logsRes, propsRes] = await Promise.all([
    supabaseAdmin.from('leads').select('*').eq('id', leadId).single(),
    supabaseAdmin.from('conversations').select('id,messages,summary,channel,created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('activity_logs').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(30),
    supabaseAdmin.from('proposals').select('id,proposal_number,package_name,total_price,status,created_at').eq('lead_id', leadId).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    lead: leadRes.data,
    conversations: convsRes.data || [],
    activities: logsRes.data || [],
    proposals: propsRes.data || [],
  })
}
