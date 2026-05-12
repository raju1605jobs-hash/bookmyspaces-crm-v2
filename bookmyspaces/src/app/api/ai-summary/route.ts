export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  generateDailySummary,
  sendDailySummaryWhatsApp,
  detectAndFlagVIPLeads,
} from '@/lib/ai-summary'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET — fetch latest or specific date summary
export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')

    if (date) {
      const { data, error } = await supabaseAdmin
        .from('ai_summaries')
        .select('*')
        .eq('date', date)
        .single()

      if (error) {
        logger.error('ai-summary', 'Failed fetching single summary', error)
      }

      return NextResponse.json({ summary: data })
    }

    // Latest 7 summaries
    const { data, error } = await supabaseAdmin
      .from('ai_summaries')
      .select('*')
      .order('date', { ascending: false })
      .limit(7)

    if (error) {
      logger.error('ai-summary', 'Failed fetching summaries', error)
    }

    return NextResponse.json({ summaries: data || [] })
  } catch (err) {
    logger.error('ai-summary', 'GET route failed', err)

    return NextResponse.json(
      { error: 'Failed to fetch summaries' },
      { status: 500 }
    )
  }
}

// POST — generate summary, send, or detect VIPs
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { action, send_whatsapp } = await req.json()

    if (action === 'generate') {
      const summary = await generateDailySummary()

      let whatsappSent = false

      if (send_whatsapp) {
        whatsappSent = await sendDailySummaryWhatsApp(summary)
      }

      return NextResponse.json({
        success: true,
        summary,
        whatsapp_sent: whatsappSent,
      })
    }

    if (action === 'detect_vips') {
      const flagged = await detectAndFlagVIPLeads()

      return NextResponse.json({
        success: true,
        flagged,
      })
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    )
  } catch (err) {
    logger.error('ai-summary', 'AI summary error', err)

    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    )
  }
}