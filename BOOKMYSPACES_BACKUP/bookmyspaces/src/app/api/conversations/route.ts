export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

// GET /api/conversations — list conversations with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const channel = searchParams.get('channel') // 'website' | 'whatsapp'
    const leadId = searchParams.get('lead_id')
    const sessionId = searchParams.get('session_id')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('conversations')
      .select('*, leads(name, phone, email, status)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (channel) query = query.eq('channel', channel)
    if (leadId) query = query.eq('lead_id', leadId)
    if (sessionId) query = query.eq('session_id', sessionId)

    const { data, error, count } = await query

    if (error) throw error

    return NextResponse.json({ conversations: data, total: count })
  } catch (err) {
    logger.error('conversations', 'GET /api/conversations error', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
