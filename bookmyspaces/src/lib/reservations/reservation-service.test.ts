import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  existingReservations: [] as Array<{ id: string; check_in_date: string; check_out_date: string }>,
  insertedRow: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
  currentStatus: 'inquiry' as string | null,
  updatedRow: null as Record<string, unknown> | null,
  updateError: null as { message: string } | null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'reservations') throw new Error(`unexpected table: ${table}`)
      return {
        select: (cols: string) => {
          // availability check path: select(...).eq(...).in(...)
          if (cols.includes('check_in_date') && cols.includes('check_out_date') && !cols.includes('status')) {
            return { eq: () => ({ in: () => Promise.resolve({ data: state.existingReservations, error: null }) }) }
          }
          // transitionReservationStatus's status lookup: select('status').eq(...).maybeSingle()
          if (cols === 'status') {
            return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.currentStatus ? { status: state.currentStatus } : null, error: null }) }) }
          }
          throw new Error(`unexpected select: ${cols}`)
        },
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: state.insertedRow, error: state.insertError }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: state.updatedRow, error: state.updateError }),
            }),
          }),
        }),
      }
    },
  }),
}))

import { createReservation, transitionReservationStatus } from './reservation-service'

const baseInput = {
  guestName: 'Priya Sharma',
  propertyId: 'prop-1',
  inventoryItemId: 'item-1',
  checkInDate: '2026-08-01',
  checkOutDate: '2026-08-05',
}

const baseRow = {
  id: 'res-1', customer_id: null, guest_name: 'Priya Sharma', guest_mobile: null, guest_email: null,
  guest_address: null, guest_id_proof: null, guest_nationality: null, property_id: 'prop-1',
  inventory_item_id: 'item-1', room_count: 1, check_in_date: '2026-08-01', check_out_date: '2026-08-05',
  nights: 4, adults: 1, children: 0, booking_source: 'direct', status: 'inquiry',
  base_room_rate: 0, discount_amount: 0, final_room_rate: 0, meal_plan_id: null, meal_plan_charge: 0,
  special_requests: null, proposal_id: null, invoice_id: null,
}

describe('createReservation', () => {
  beforeEach(() => {
    state.existingReservations = []
    state.insertedRow = null
    state.insertError = null
  })

  it('refuses to create a reservation when the inventory item is unavailable', async () => {
    state.existingReservations = [{ id: 'existing-res', check_in_date: '2026-08-02', check_out_date: '2026-08-06' }]

    const result = await createReservation(baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unavailable')
      if (result.error === 'unavailable') expect(result.conflictingReservationIds).toEqual(['existing-res'])
    }
  })

  it('creates the reservation in inquiry status when the item is available', async () => {
    state.insertedRow = baseRow

    const result = await createReservation(baseInput)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reservation.status).toBe('inquiry')
      expect(result.reservation.guestName).toBe('Priya Sharma')
    }
  })

  it('surfaces a db_error result when the insert fails', async () => {
    state.insertError = { message: 'constraint violation' }

    const result = await createReservation(baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('db_error')
  })
})

describe('transitionReservationStatus', () => {
  beforeEach(() => {
    state.currentStatus = 'inquiry'
    state.updatedRow = null
    state.updateError = null
  })

  it('allows inquiry -> confirmed and returns the updated reservation', async () => {
    state.updatedRow = { ...baseRow, status: 'confirmed' }

    const result = await transitionReservationStatus('res-1', 'confirmed')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reservation.status).toBe('confirmed')
  })

  it('rejects an invalid transition without touching the database', async () => {
    state.currentStatus = 'checked_out'

    const result = await transitionReservationStatus('res-1', 'confirmed')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid_transition')
      if (result.error === 'invalid_transition') {
        expect(result.from).toBe('checked_out')
        expect(result.to).toBe('confirmed')
      }
    }
  })

  it('returns not_found when the reservation does not exist', async () => {
    state.currentStatus = null

    const result = await transitionReservationStatus('missing-id', 'confirmed')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not_found')
  })
})
