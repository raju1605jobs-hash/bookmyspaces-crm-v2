export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

const VERIFY_TOKEN = 'bookmyspaces_webhook_2024'

// Meta webhook verification
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      logger.info('whatsapp-webhook', 'Webhook verified successfully')
      return new NextResponse(challenge, { status: 200 })
    }

    logger.error('whatsapp-webhook', 'Webhook verification failed', { mode, token })
    return new NextResponse('Forbidden', { status: 403 })
  } catch (error) {
    logger.error('whatsapp-webhook', 'GET error', error)
    return new NextResponse('Error', { status: 500 })
  }
}

// Incoming messages from Meta
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    logger.info('whatsapp-webhook', 'Incoming webhook event', body)

    const entry = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const messages = value?.messages

    if (!messages?.length) {
      return NextResponse.json({ received: true })
    }

    const msg = messages[0]
    const from = msg.from // customer phone number
    const msgType = msg.type
    const text = msgType === 'text' ? msg.text?.body : null

    logger.info('whatsapp-webhook', 'Message received', { from, msgType, text })

    // TODO: process message with AI and reply
    // This will be connected to the AI chatbot in next phase

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('whatsapp-webhook', 'POST error', error)
    return NextResponse.json({ received: true }) // always return 200 to Meta
  }
}
