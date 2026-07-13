// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/api/reservations/[id]/proposal/route.ts
// V3 Sprint 3 — Priority 2: Proposal Management, Reservation -> Proposal.
//
// POST — generates a proposal from an existing reservation. Thin wrapper
// over proposal-service.ts's createProposalFromReservation() (built and
// unit-tested Day 4, never called from any route until now) — this route's
// only job is to fetch the reservation and map its fields onto that
// function's input shape; no pricing or proposal-writing logic here.
//
// Depends on migration 013's proposals.reservation_id/property_id/
// inventory_item_id columns existing — will fail with a 502 until that
// migration is applied, same as every other Reservation Platform route.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { requireAuth } from '@/lib/auth-guard'
import { getReservationById } from '@/lib/reservations/reservation-service'
import { createProposalFromReservation } from '@/lib/proposals/proposal-service'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    const reservation = await getReservationById(params.id)
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
    }

    const result = await createProposalFromReservation({
      reservationId: reservation.id,
      leadId: reservation.customerId,
      clientName: reservation.guestName,
      clientPhone: reservation.guestMobile,
      clientEmail: reservation.guestEmail,
      propertyId: reservation.propertyId,
      inventoryItemId: reservation.inventoryItemId,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      guestCount: reservation.adults + reservation.children,
      packageName: reservation.inventoryName,
      specialRequirements: reservation.specialRequests,
    })

    if (!result.ok) {
      logger.error('reservations/[id]/proposal', 'db_error', result.message)
      return NextResponse.json({ error: 'Could not create proposal', detail: result.message }, { status: 502 })
    }

    return NextResponse.json(
      { proposalId: result.proposalId, proposalNumber: result.proposalNumber, totalPrice: result.totalPrice },
      { status: 201 }
    )
  } catch (error) {
    logger.error('reservations/[id]/proposal', 'POST failed', error)
    return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 })
  }
}
