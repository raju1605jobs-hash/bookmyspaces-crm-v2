// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/reservations/reservation-workflow.ts
// V3 Day 4 — Priority 4: complete the first usable Reservation workflow.
//
// Orchestrates Day 2's reservation building blocks (availability-service.ts,
// reservation-service.ts) plus Day 2's pricing-service.ts into the five
// named operations the master spec asks for: Check Availability, Calculate
// Price, Create Reservation, Confirm Reservation, Cancel Reservation. No new
// business logic is introduced here beyond the orchestration itself —
// checkAvailability/createReservation/transitionReservationStatus are
// reused exactly as Day 2 wrote them.
//
// "Connect to: CRM / Pricing Engine / Proposal Module / Timeline":
//   - Pricing Engine -> calculatePrice() below, via pricing-service.ts's
//     getInventoryItemRate()
//   - CRM -> every state-changing operation writes an `activity_logs` row
//     (the same LIVE table src/app/api/leads/route.ts and followups/route.ts
//     already write to — reused, not duplicated)
//   - Timeline -> automatic: src/lib/timeline/timeline-service.ts already
//     reads both `reservations` and `activity_logs`, so nothing extra is
//     needed here for a reservation to show up on a customer's timeline
//   - Proposal Module -> reservations.proposal_id (migration 012) can be
//     set at creation time when a reservation originates from an accepted
//     proposal; linking the other direction (proposals.reservation_id,
//     migration 013) is src/lib/proposals/proposal-service.ts's job, kept
//     separate so this file doesn't need to know about proposal internals
//
// NOT LIVE-TESTABLE YET, same as everything built on migration 012's
// `reservations` table (see reservation-service.ts's header).
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { checkAvailability, type AvailabilityCheckResult } from './availability-service'
import { createReservation, transitionReservationStatus, type CreateReservationInput, type CreateReservationResult, type TransitionResult } from './reservation-service'
import { getInventoryItemRate } from '@/lib/pricing/pricing-service'

export interface PriceQuote {
  inventoryItemId: string
  checkInDate: string
  checkOutDate: string
  nights: number
  roomCount: number
  /** Nights this quote has a real rate_plans price for. */
  pricedNights: number
  /** Nights with no matching rate_plans row — quote is a lower bound, not final, when this is > 0. */
  unpricedNights: number
  nightlyRates: number[]
  subtotal: number
  isComplete: boolean
}

function enumerateNights(checkInDate: string, checkOutDate: string): string[] {
  const nights: string[] = []
  const cursor = new Date(checkInDate + 'T00:00:00Z')
  const end = new Date(checkOutDate + 'T00:00:00Z')
  while (cursor < end) {
    nights.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return nights
}

/**
 * Calculate Price — sums the applicable rate_plans price for every night of
 * the stay (per room), via pricing-service.ts's getInventoryItemRate(). If
 * any night has no matching rate plan, the quote is marked incomplete
 * (isComplete: false) rather than silently under-quoting — callers should
 * not present an incomplete quote as final.
 */
export async function calculatePrice(
  inventoryItemId: string,
  checkInDate: string,
  checkOutDate: string,
  roomCount = 1
): Promise<PriceQuote> {
  const nights = enumerateNights(checkInDate, checkOutDate)
  const rates = await Promise.all(nights.map((date) => getInventoryItemRate(inventoryItemId, date)))

  const nightlyRates = rates.map((r) => r ?? 0)
  const pricedNights = rates.filter((r) => r !== null).length
  const unpricedNights = nights.length - pricedNights
  const subtotal = nightlyRates.reduce((sum, r) => sum + r, 0) * roomCount

  return {
    inventoryItemId,
    checkInDate,
    checkOutDate,
    nights: nights.length,
    roomCount,
    pricedNights,
    unpricedNights,
    nightlyRates,
    subtotal,
    isComplete: unpricedNights === 0 && nights.length > 0,
  }
}

async function logActivity(leadId: string | null, action: string, description: string, metadata: Record<string, unknown>): Promise<void> {
  if (!leadId) return
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('activity_logs').insert({ lead_id: leadId, action, description, performed_by: 'system', metadata })
  } catch {
    // Activity logging is CRM visibility, not a correctness requirement —
    // never let a logging failure fail the reservation operation itself.
  }
}

export interface CreateReservationWithQuoteInput extends CreateReservationInput {
  /** Populated onto activity_logs / used for the CRM trail — separate from customerId, which is the reservations.customer_id FK. */
  crmLeadId?: string | null
}

export interface CreateReservationWithQuoteResult {
  reservationResult: CreateReservationResult
  quote: PriceQuote | null
}

/**
 * Check Availability -> Calculate Price -> Create Reservation, in one call.
 * Availability is still checked again inside createReservation() itself
 * (defense in depth against a race between the two calls) — this wrapper's
 * job is just to attach a price quote and a CRM activity entry, not to
 * change createReservation()'s own availability guarantee.
 */
export async function createReservationWithQuote(
  input: CreateReservationWithQuoteInput
): Promise<CreateReservationWithQuoteResult> {
  const availability = await checkAvailability(input.inventoryItemId, input.checkInDate, input.checkOutDate)
  if (!availability.available) {
    return {
      reservationResult: { ok: false, error: 'unavailable', conflictingReservationIds: availability.conflictingReservationIds },
      quote: null,
    }
  }

  const quote = await calculatePrice(input.inventoryItemId, input.checkInDate, input.checkOutDate, input.roomCount ?? 1)
  const reservationResult = await createReservation(input)

  if (reservationResult.ok) {
    await logActivity(
      input.crmLeadId ?? input.customerId ?? null,
      'reservation_created',
      `Reservation created for ${input.checkInDate} -> ${input.checkOutDate}`,
      { reservationId: reservationResult.reservation.id, subtotal: quote.subtotal, isComplete: quote.isComplete }
    )
  }

  return { reservationResult, quote }
}

/** Confirm Reservation — named wrapper around the existing state machine (inquiry/tentative -> confirmed). */
export async function confirmReservation(reservationId: string, crmLeadId?: string | null): Promise<TransitionResult> {
  const result = await transitionReservationStatus(reservationId, 'confirmed')
  if (result.ok) {
    await logActivity(crmLeadId ?? result.reservation.customerId, 'reservation_confirmed', `Reservation ${reservationId} confirmed`, { reservationId })
  }
  return result
}

/** Cancel Reservation — named wrapper around the existing state machine (-> cancelled). */
export async function cancelReservation(reservationId: string, reason: string | null, crmLeadId?: string | null): Promise<TransitionResult> {
  const result = await transitionReservationStatus(reservationId, 'cancelled')
  if (result.ok) {
    await logActivity(crmLeadId ?? result.reservation.customerId, 'reservation_cancelled', reason ?? `Reservation ${reservationId} cancelled`, { reservationId, reason })
  }
  return result
}

export type { AvailabilityCheckResult }
