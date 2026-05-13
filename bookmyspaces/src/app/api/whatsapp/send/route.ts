export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { smartSend } from '@/lib/queue'
import { WHATSAPP_MESSAGES } from '@/lib/templates'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { phone, message, lead_id, template, type = 'session' } = body

    if (!phone) return NextResponse.json({ error: 'Phone number required' }, { status: 400 })

    let finalMessage = message
    if (template) {
      switch (template) {
        case 'greeting': finalMessage = WHATSAPP_MESSAGES.greeting(); break
        case 'packages': finalMessage = WHATSAPP_MESSAGES.packagesOverview(); break
        case 'followup': finalMessage = WHATSAPP_MESSAGES.followUp(); break
        case 'payment': finalMessage = WHATSAPP_MESSAGES.paymentInfo(); break
        case 'trust': finalMessage = WHATSAPP_MESSAGES.trustMessage(); break
        case 'urgency': finalMessage = WHATSAPP_MESSAGES.urgency(); break
        case 'escalate': finalMessage = WHATSAPP_MESSAGES.escalateToHuman(); break
        case 'rooftop': finalMessage = WHATSAPP_MESSAGES.rooftopInfo(); break
        case 'dining': finalMessage = WHATSAPP_MESSAGES.privateDining(); break
        case 'skyline': finalMessage = WHATSAPP_MESSAGES.skylineRooms(); break
        case 'cafe': finalMessage = WHATSAPP_MESSAGES.cafeInfo(); break
      }
    }

    if (!finalMessage) return NextResponse.json({ error: 'Message content required' }, { status: 400 })

    const success = await smartSend(phone, finalMessage, { type })

    if (success && lead_id) {
      await supabaseAdmin.from('activity_logs').insert({ lead_id, action: 'whatsapp_sent', description: `WhatsApp message sent: "${finalMessage.substring(0, 100)}..."`, performed_by: 'staff', metadata: { template, phone } })
      await supabaseAdmin.from('leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', lead_id)
    }

    return NextResponse.json({ success, phone, message_preview: finalMessage.substring(0, 100) })
  } catch (err) {
    logger.error('whatsapp-send', 'POST /api/whatsapp/send error', err)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
