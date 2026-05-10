export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('notification_settings')
      .select('*')
      .order('key')

    const settings: Record<string, string> = {}
    for (const row of data || []) {
      settings[row.key] = row.value || ''
    }

    return NextResponse.json({ settings })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { settings } = await req.json()

    for (const [key, value] of Object.entries(settings)) {
      await supabaseAdmin
        .from('notification_settings')
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
