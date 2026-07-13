// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/api/reservations/[id]/status/route.ts
// V3 Day 6 — Operator Experience sprint.
//
// POST — the four operator-triggered status transitions the Reservation
// Details screen needs (confirm / cancel / check_in / check_out). Thin
// wrapper over reservation-workflow.ts's named transition functions —
// this route does not implement the state machine itself, it only maps an
// HTTP action name onto the already-tested function that enforces it.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { requireAuth } from '@/lib/auth-guard'
import { parseBody, reservationStatusActionSchema } from '@/lib/validation'
import { confirmReservation, cancelReservation, checkInReservation, checkOutReservation } from '@/lib/reservations/reservation-workflow'
import type { TransitionResult } from '@/lib/reservations/reservation-service'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const parsed = await parseBody(req, reservationStatusActionSchema)
  if (!parsed.ok) return parsed.response
  const { action, reason, crmLeadId } = parsed.data

  try {
    let result: TransitionResult

    switch (action) {
      case 'confirm':
        result = await confirmReservation(params.id, crmLeadId ?? null)
        break
      case 'cancel':
        result = await cancelReservation(params.id, reason ?? null, crmLeadId ?? null)
        break
      case 'check_in':
        result = await checkInReservation(params.id, crmLeadId ?? null)
        break
      case 'check_out':
        result = await checkOutReservation(params.id, crmLeadId ?? null)
        break
    }

    if (!result.ok) {
      if (result.error === 'not_found') {
        return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
      }
      if (result.error === 'invalid_transition') {
        return NextResponse.json(
          { error: `Cannot move a reservation from "${result.from}" to "${result.to}"`, from: result.from, to: result.to },
          { status: 409 }
        )
      }
      logger.error('reservations/[id]/status', 'db_error', result.message)
      return NextResponse.json({ error: 'Could not update reservation status', detail: result.message }, { status: 502 })
    }

    return NextResponse.json({ reservation: result.reservation })
  } catch (error) {
    logger.error('reservations/[id]/status', 'POST failed', error)
    return NextResponse.json({ error: 'Failed to update reservation status' }, { status: 500 })
  }
}
