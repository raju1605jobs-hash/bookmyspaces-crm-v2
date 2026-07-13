// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/reservations/reservation-service.ts
// V3 Day 2 — Reservation Platform foundation, business logic layer.
//
// NOT LIVE-TESTABLE YET — see property-service.ts's header; same caveat
// applies (reads/writes `reservations`, drafted in migration 012, not live).
//
// Status transitions reuse isValidReservationTransition() from Day 1
// (src/types/reservation.ts), which is itself modeled on
// src/modules/leads/lead-stage-manager.ts's existing VALID_TRANSITIONS
// pattern per the architecture review's explicit recommendation — this
// service is the "connect it to a real table" half of that pattern, not a
// new state machine.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { isValidReservationTransition, type Reservation, type ReservationStatus } from '@/types/reservation'
import { checkAvailability } from './availability-service'

export interface CreateReservationInput {
  customerId?: string | null
  guestName: string
  guestMobile?: string | null
  guestEmail?: string | null
  propertyId: string
  inventoryItemId: string
  checkInDate: string
  checkOutDate: string
  adults?: number
  children?: number
  roomCount?: number
  bookingSource?: Reservation['bookingSource']
  specialRequests?: string | null
}

export type CreateReservationResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; error: 'unavailable'; conflictingReservationIds: string[] }
  | { ok: false; error: 'db_error'; message: string }

/**
 * Creates a reservation after checking availability — never creates an
 * overlapping booking for the same inventory item, mirroring "never create
 * duplicate customers" from Identity Resolution but for inventory instead
 * of identity. Starts in 'inquiry' status; callers use transitionStatus()
 * to move it forward, which enforces the same state machine everywhere
 * rather than letting callers set an arbitrary status on create.
 */
export async function createReservation(input: CreateReservationInput): Promise<CreateReservationResult> {
  const availability = await checkAvailability(input.inventoryItemId, input.checkInDate, input.checkOutDate)
  if (!availability.available) {
    return { ok: false, error: 'unavailable', conflictingReservationIds: availability.conflictingReservationIds }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      customer_id: input.customerId ?? null,
      guest_name: input.guestName,
      guest_mobile: input.guestMobile ?? null,
      guest_email: input.guestEmail ?? null,
      property_id: input.propertyId,
      inventory_item_id: input.inventoryItemId,
      room_count: input.roomCount ?? 1,
      check_in_date: input.checkInDate,
      check_out_date: input.checkOutDate,
      adults: input.adults ?? 1,
      children: input.children ?? 0,
      booking_source: input.bookingSource ?? 'direct',
      status: 'inquiry',
      special_requests: input.specialRequests ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: 'db_error', message: error?.message ?? 'Unknown error creating reservation' }
  }

  return { ok: true, reservation: mapRow(data) }
}

export type TransitionResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; error: 'invalid_transition'; from: ReservationStatus; to: ReservationStatus }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'db_error'; message: string }

export async function transitionReservationStatus(reservationId: string, toStatus: ReservationStatus): Promise<TransitionResult> {
  const supabase = getSupabaseAdmin()

  const { data: current, error: fetchError } = await supabase
    .from('reservations')
    .select('status')
    .eq('id', reservationId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: 'db_error', message: fetchError.message }
  if (!current) return { ok: false, error: 'not_found' }

  const fromStatus = current.status as ReservationStatus
  if (!isValidReservationTransition(fromStatus, toStatus)) {
    return { ok: false, error: 'invalid_transition', from: fromStatus, to: toStatus }
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({ status: toStatus })
    .eq('id', reservationId)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: 'db_error', message: error?.message ?? 'Unknown error updating reservation' }

  return { ok: true, reservation: mapRow(data) }
}

function mapRow(row: Record<string, any>): Reservation {
  return {
    id: row.id,
    customerId: row.customer_id,
    guestName: row.guest_name,
    guestMobile: row.guest_mobile,
    guestEmail: row.guest_email,
    guestAddress: row.guest_address,
    guestIdProof: row.guest_id_proof,
    guestNationality: row.guest_nationality,
    propertyId: row.property_id,
    inventoryItemId: row.inventory_item_id,
    roomCount: row.room_count,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    nights: row.nights,
    adults: row.adults,
    children: row.children,
    bookingSource: row.booking_source,
    status: row.status,
    baseRoomRate: Number(row.base_room_rate) || 0,
    discountAmount: Number(row.discount_amount) || 0,
    finalRoomRate: Number(row.final_room_rate) || 0,
    mealPlanId: row.meal_plan_id,
    mealPlanCharge: Number(row.meal_plan_charge) || 0,
    specialRequests: row.special_requests,
    proposalId: row.proposal_id,
    invoiceId: row.invoice_id,
  }
}
