// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/api/customers/[id]/timeline/route.ts
// V3 Day 6 — Operator Experience sprint.
//
// GET — the Customer Timeline, for the Customer Profile screen. Thin
// wrapper over timeline-service.ts's getCustomerTimeline(), built and
// unit-tested in Day 4 but never exposed over HTTP until now. Unlike the
// Reservation routes, this one is fully live today: getCustomerTimeline()
// reads chat/WhatsApp/email/activity/proposals/payments from tables that
// already exist in production, and only degrades (not errors) the
// reservation/AI-interaction sources that depend on migration 012.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { requireAuth } from '@/lib/auth-guard'
import { getCustomerTimeline } from '@/lib/timeline/timeline-service'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    const timeline = await getCustomerTimeline(params.id)
    return NextResponse.json({ timeline })
  } catch (error) {
    logger.error('customers/[id]/timeline', 'GET failed', error)
    return NextResponse.json({ error: 'Failed to fetch customer timeline' }, { status: 500 })
  }
}
