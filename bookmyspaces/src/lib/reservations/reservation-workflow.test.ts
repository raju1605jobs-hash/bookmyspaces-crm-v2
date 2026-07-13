import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  createReservation: vi.fn(),
  transitionReservationStatus: vi.fn(),
  getInventoryItemRate: vi.fn(),
}))

vi.mock('./availability-service', () => ({
  checkAvailability: mocks.checkAvailability,
}))

vi.mock('./reservation-service', () => ({
  createReservation: mocks.createReservation,
  transitionReservationStatus: mocks.transitionReservationStatus,
}))

vi.mock('@/lib/pricing/pricing-service', () => ({
  getInventoryItemRate: mocks.getInventoryItemRate,
}))

const activityInserts: Record<string, unknown>[] = []
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        activityInserts.push(row)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

import { calculatePrice, createReservationWithQuote, confirmReservation, cancelReservation, checkInReservation, checkOutReservation } from './reservation-workflow'

const baseInput = {
  guestName: 'Priya Sharma',
  propertyId: 'prop-1',
  inventoryItemId: 'item-1',
  checkInDate: '2026-08-01',
  checkOutDate: '2026-08-03',
}

describe('calculatePrice', () => {
  beforeEach(() => mocks.getInventoryItemRate.mockReset())

  it('sums a nightly rate across each night of the stay', async () => {
    mocks.getInventoryItemRate.mockResolvedValueOnce(5000).mockResolvedValueOnce(5500)

    const quote = await calculatePrice('item-1', '2026-08-01', '2026-08-03')

    expect(quote.nights).toBe(2)
    expect(quote.nightlyRates).toEqual([5000, 5500])
    expect(quote.subtotal).toBe(10500)
    expect(quote.isComplete).toBe(true)
  })

  it('multiplies by roomCount', async () => {
    mocks.getInventoryItemRate.mockResolvedValue(5000)
    const quote = await calculatePrice('item-1', '2026-08-01', '2026-08-02', 3)
    expect(quote.subtotal).toBe(15000)
  })

  it('marks the quote incomplete when a night has no matching rate plan', async () => {
    mocks.getInventoryItemRate.mockResolvedValueOnce(5000).mockResolvedValueOnce(null)

    const quote = await calculatePrice('item-1', '2026-08-01', '2026-08-03')

    expect(quote.pricedNights).toBe(1)
    expect(quote.unpricedNights).toBe(1)
    expect(quote.isComplete).toBe(false)
  })
})

describe('createReservationWithQuote', () => {
  beforeEach(() => {
    mocks.checkAvailability.mockReset()
    mocks.createReservation.mockReset()
    mocks.getInventoryItemRate.mockReset().mockResolvedValue(5000)
    activityInserts.length = 0
  })

  it('returns unavailable without creating a reservation when the dates conflict', async () => {
    mocks.checkAvailability.mockResolvedValue({ available: false, conflictingReservationIds: ['r1'] })

    const result = await createReservationWithQuote(baseInput)

    expect(result.reservationResult).toEqual({ ok: false, error: 'unavailable', conflictingReservationIds: ['r1'] })
    expect(result.quote).toBeNull()
    expect(mocks.createReservation).not.toHaveBeenCalled()
    expect(activityInserts).toHaveLength(0)
  })

  it('creates the reservation, attaches a quote, and logs a CRM activity entry', async () => {
    mocks.checkAvailability.mockResolvedValue({ available: true, conflictingReservationIds: [] })
    mocks.createReservation.mockResolvedValue({ ok: true, reservation: { id: 'res-1', customerId: 'lead-1' } })

    const result = await createReservationWithQuote({ ...baseInput, customerId: 'lead-1', crmLeadId: 'lead-1' })

    expect(result.reservationResult.ok).toBe(true)
    expect(result.quote?.subtotal).toBe(10000)
    expect(activityInserts).toHaveLength(1)
    expect(activityInserts[0]).toMatchObject({ lead_id: 'lead-1', action: 'reservation_created' })
  })

  it('does not log activity when reservation creation fails after availability passes', async () => {
    mocks.checkAvailability.mockResolvedValue({ available: true, conflictingReservationIds: [] })
    mocks.createReservation.mockResolvedValue({ ok: false, error: 'db_error', message: 'boom' })

    await createReservationWithQuote(baseInput)

    expect(activityInserts).toHaveLength(0)
  })
})

describe('confirmReservation / cancelReservation', () => {
  beforeEach(() => {
    mocks.transitionReservationStatus.mockReset()
    activityInserts.length = 0
  })

  it('confirmReservation transitions to confirmed and logs activity', async () => {
    mocks.transitionReservationStatus.mockResolvedValue({ ok: true, reservation: { id: 'res-1', customerId: 'lead-1' } })

    const result = await confirmReservation('res-1')

    expect(mocks.transitionReservationStatus).toHaveBeenCalledWith('res-1', 'confirmed')
    expect(result.ok).toBe(true)
    expect(activityInserts[0]).toMatchObject({ action: 'reservation_confirmed', lead_id: 'lead-1' })
  })

  it('cancelReservation transitions to cancelled with a reason and logs activity', async () => {
    mocks.transitionReservationStatus.mockResolvedValue({ ok: true, reservation: { id: 'res-1', customerId: 'lead-1' } })

    const result = await cancelReservation('res-1', 'Customer changed plans')

    expect(mocks.transitionReservationStatus).toHaveBeenCalledWith('res-1', 'cancelled')
    expect(result.ok).toBe(true)
    expect(activityInserts[0]).toMatchObject({ action: 'reservation_cancelled', description: 'Customer changed plans' })
  })

  it('does not log activity when the transition is invalid', async () => {
    mocks.transitionReservationStatus.mockResolvedValue({ ok: false, error: 'invalid_transition', from: 'checked_out', to: 'confirmed' })

    const result = await confirmReservation('res-1')

    expect(result.ok).toBe(false)
    expect(activityInserts).toHaveLength(0)
  })
})

describe('checkInReservation / checkOutReservation', () => {
  beforeEach(() => {
    mocks.transitionReservationStatus.mockReset()
    activityInserts.length = 0
  })

  it('checkInReservation transitions to checked_in and logs activity', async () => {
    mocks.transitionReservationStatus.mockResolvedValue({ ok: true, reservation: { id: 'res-1', customerId: 'lead-1' } })

    const result = await checkInReservation('res-1')

    expect(mocks.transitionReservationStatus).toHaveBeenCalledWith('res-1', 'checked_in')
    expect(result.ok).toBe(true)
    expect(activityInserts[0]).toMatchObject({ action: 'reservation_checked_in', lead_id: 'lead-1' })
  })

  it('checkOutReservation transitions to checked_out and logs activity', async () => {
    mocks.transitionReservationStatus.mockResolvedValue({ ok: true, reservation: { id: 'res-1', customerId: 'lead-1' } })

    const result = await checkOutReservation('res-1')

    expect(mocks.transitionReservationStatus).toHaveBeenCalledWith('res-1', 'checked_out')
    expect(result.ok).toBe(true)
    expect(activityInserts[0]).toMatchObject({ action: 'reservation_checked_out', lead_id: 'lead-1' })
  })

  it('does not log activity when a check-in/out transition is invalid', async () => {
    mocks.transitionReservationStatus.mockResolvedValue({ ok: false, error: 'invalid_transition', from: 'inquiry', to: 'checked_in' })

    const result = await checkInReservation('res-1')

    expect(result.ok).toBe(false)
    expect(activityInserts).toHaveLength(0)
  })
})
