export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { batchScoreLeads } from '@/lib/scoring'

export async function GET(req: NextRequest) {
  try {
    // IMPORTANT:
    // Create Supabase client INSIDE request handler
    // NOT at module scope
    const supabaseAdmin = getSupabaseAdmin()

    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '30'

    const since = new Date(
      Date.now() - parseInt(period) * 24 * 60 * 60 * 1000
    ).toISOString()

    const [
      { data: leads },
      { data: recentLeads },
      { data: statusCounts },
      { data: sourceCounts },
      { data: proposals },
      { data: conversations },
    ] = await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('*')
        .gte('created_at', since),

      supabaseAdmin
        .from('leads')
        .select(
          'id, created_at, status, source, lead_score, ai_score, event_type, venue'
        )
        .order('created_at', { ascending: false })
        .limit(10),

      supabaseAdmin
        .from('leads')
        .select('status')
        .gte('created_at', since),

      supabaseAdmin
        .from('leads')
        .select('source')
        .gte('created_at', since),

      supabaseAdmin
        .from('proposals')
        .select('status, total_price, created_at')
        .gte('created_at', since),

      supabaseAdmin
        .from('conversations')
        .select('channel, created_at')
        .gte('created_at', since),
    ])

    const statusBreakdown = (statusCounts || []).reduce(
      (acc: Record<string, number>, row: any) => {
        const s =
          row.status === 'new'
            ? 'new_inquiry'
            : (row.status ?? 'new_inquiry')

        acc[s] = (acc[s] || 0) + 1

        return acc
      },
      {}
    )

    const sourceBreakdown = (sourceCounts || []).reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.source] = (acc[row.source] || 0) + 1
        return acc
      },
      {}
    )

    const confirmedRevenue = (proposals || [])
      .filter((p: any) => p.status === 'accepted')
      .reduce(
        (sum: number, p: any) => sum + (p.total_price || 0),
        0
      )

    const pipelineRevenue = (proposals || [])
      .filter((p: any) =>
        ['draft', 'sent', 'viewed'].includes(p.status)
      )
      .reduce(
        (sum: number, p: any) => sum + (p.total_price || 0),
        0
      )

    const totalLeads = leads?.length || 0
    const confirmedLeads = statusBreakdown['confirmed'] || 0

    const conversionRate =
      totalLeads > 0
        ? Math.round((confirmedLeads / totalLeads) * 100)
        : 0

    const dailyCounts: Record<string, number> = {}
    const today = new Date()

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)

      dailyCounts[d.toISOString().split('T')[0]] = 0
    }

    for (const lead of leads || []) {
      const day = lead.created_at.split('T')[0]

      if (dailyCounts[day] !== undefined) {
        dailyCounts[day]++
      }
    }

    const dailyChart = Object.entries(dailyCounts).map(
      ([date, count]) => ({
        date,
        label: new Date(date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        }),
        count,
      })
    )

    const channelBreakdown = (conversations || []).reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.channel] = (acc[row.channel] || 0) + 1
        return acc
      },
      {}
    )

    const now = new Date().toISOString()

    const cutoff24h = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString()

    const [
      { count: overdueCount },
      { count: pendingContactCount },
    ] = await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('status', [
          'new_inquiry',
          'followup_pending',
          'future_prospect',
        ])
        .not('followup_date', 'is', null)
        .lt('followup_date', now),

      supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('status', [
          'new_inquiry',
          'followup_pending',
        ])
        .not('phone', 'is', null)
        .or(
          `last_contacted_at.is.null,last_contacted_at.lt.${cutoff24h}`
        ),
    ])

    return NextResponse.json({
      period: parseInt(period),

      summary: {
        total_leads: totalLeads,

        new_leads:
          statusBreakdown['new_inquiry'] || 0,

        confirmed: confirmedLeads,

        conversion_rate: conversionRate,

        confirmed_revenue: confirmedRevenue,

        pipeline_revenue: pipelineRevenue,

        proposals_sent:
          proposals?.filter(
            (p: any) => p.status !== 'draft'
          ).length || 0,

        avg_lead_score:
          totalLeads > 0
            ? Math.round(
                (leads || []).reduce(
                  (s: number, l: any) =>
                    s +
                    (l.ai_score ||
                      l.lead_score ||
                      5),
                  0
                ) / totalLeads
              )
            : 5,
      },

      status_breakdown: statusBreakdown,

      source_breakdown: sourceBreakdown,

      channel_breakdown: channelBreakdown,

      daily_chart: dailyChart,

      recent_leads: recentLeads,

      followups: {
        overdue: overdueCount || 0,
        pending_contact:
          pendingContactCount || 0,
      },
    })
  } catch (err) {
    logger.error(
      'analytics',
      'Analytics error',
      err
    )

    return NextResponse.json(
      { error: 'Failed to load analytics' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    // IMPORTANT:
    // Create client INSIDE handler
    const supabaseAdmin = getSupabaseAdmin()

    const { action } = await req.json()

    if (action === 'score_leads') {
      const scored = await batchScoreLeads(20)

      return NextResponse.json({
        success: true,
        scored,
      })
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    )
  } catch (err) {
    logger.error(
      'analytics',
      'POST analytics error',
      err
    )

    return NextResponse.json(
      { error: 'Failed' },
      { status: 500 }
    )
  }
}