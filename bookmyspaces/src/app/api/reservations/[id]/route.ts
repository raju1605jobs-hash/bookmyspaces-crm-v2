// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/api/reservations/[id]/route.ts
// V3 Day 6 — Operator Experience sprint.
//
// GET — single reservation with property/inventory names joined in, for the
// Reservation Details screen. Thin wrapper over reservation-service.ts's
// getReservationById().
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { requireAuth } from '@/lib/auth-guard'
import { getReservationById } from '@/lib/reservations/reservation-service'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    const reservation = await getReservationById(params.id)
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }
    return NextResponse.json({ reservation })
  } catch (error) {
    logger.error('reservations/[id]', 'GET failed', error)
    return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500 })
  }
}
