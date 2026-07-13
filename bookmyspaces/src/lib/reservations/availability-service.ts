// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/reservations/availability-service.ts
// V3 Day 2 — Reservation Platform foundation, business logic layer.
//
// NOT LIVE-TESTABLE YET — see property-service.ts's header; same caveat
// applies (reads from `reservations`, drafted in migration 012, not live).
//
// Availability rule: an inventory item is unavailable for a requested
// [checkIn, checkOut) range if any existing reservation for that item, in a
// non-cancelled/non-no-show status, overlaps that range. `room_count` is not
// factored in here deliberately — that would mean deciding how many units
// of a given inventory item exist and how overbooking should be prevented
// across them, which is a real product decision (single-unit rooms vs.
// multi-unit inventory) not yet made. Today: available means zero
// overlapping reservations, full stop. Documented as a known simplification.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import type { ReservationStatus } from '@/types/reservation'

const BLOCKING_STATUSES: ReservationStatus[] = ['inquiry', 'tentative', 'confirmed', 'checked_in']

export interface AvailabilityCheckResult {
  available: boolean
  conflictingReservationIds: string[]
}

/**
 * Pure overlap-detection logic, extracted so it can be unit-tested without a
 * database. Two date ranges [aStart, aEnd) and [bStart, bEnd) overlap iff
 * aStart < bEnd AND bStart < aEnd (standard half-open interval overlap).
 */
export function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

export async function checkAvailability(
  inventoryItemId: string,
  checkInDate: string,
  checkOutDate: string,
  excludeReservationId?: string
): Promise<AvailabilityCheckResult> {
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('reservations')
    .select('id, check_in_date, check_out_date')
    .eq('inventory_item_id', inventoryItemId)
    .in('status', BLOCKING_STATUSES)

  if (excludeReservationId) {
    query = query.neq('id', excludeReservationId)
  }

  const { data, error } = await query

  if (error || !data) {
    // Fail closed: if we can't verify availability, don't claim it's available.
    return { available: false, conflictingReservationIds: [] }
  }

  const conflicts = data.filter((r) => dateRangesOverlap(checkInDate, checkOutDate, r.check_in_date, r.check_out_date))

  return {
    available: conflicts.length === 0,
    conflictingReservationIds: conflicts.map((r) => r.id),
  }
}
