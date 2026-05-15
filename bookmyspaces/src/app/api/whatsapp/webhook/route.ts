export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * META WEBHOOK VERIFICATION
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    // Verify webhook with Meta
    if (
      mode === 'subscribe' &&
      token === 'bookmyspaces_webhook_2024'
    ) {
      return new NextResponse(challenge || 'verified', {
        status: 200,
      })
    }

    return new NextResponse('Verification failed', {
      status: 403,
    })
  } catch (error) {
    logger.error('whatsapp-webhook', 'GET webhook verification error', error)

    return new NextResponse('Webhook error', {
      status: 500,
    })
  }
}

/**
 * META INCOMING MESSAGE WEBHOOK
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('META WEBHOOK EVENT:', JSON.stringify(body, null, 2))

    // Acknowledge webhook immediately
    return NextResponse.json({
      success: true,
      received: true,
    })
  } catch (error) {
    logger.error('whatsapp-webhook', 'POST webhook error', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Webhook processing failed',
      },
      {
        status: 500,
      }
    )
  }
}