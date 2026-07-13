// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/types/reservation.test.ts
// Pure-function tests — no DB, no mocking needed — for the pricing engine's
// rate-resolution logic and the reservation status state machine.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { resolveApplicableRate, isValidReservationTransition, type RatePlan } from './reservation'

type TestRate = Pick<RatePlan, 'rateType' | 'startDate' | 'endDate' | 'price' | 'priority' | 'isActive'>

describe('resolveApplicableRate', () => {
  it('returns null when no rate plans apply', () => {
    expect(resolveApplicableRate([], '2026-08-01')).toBeNull()
  })

  it('returns the base rate when it is the only applicable plan', () => {
    const rates: TestRate[] = [
      { rateType: 'base', startDate: null, endDate: null, price: 5000, priority: 0, isActive: true },
    ]
    expect(resolveApplicableRate(rates, '2026-08-01')).toBe(5000)
  })

  it('prefers a higher-priority rate over base even without an explicit date range', () => {
    const rates: TestRate[] = [
      { rateType: 'base', startDate: null, endDate: null, price: 5000, priority: 0, isActive: true },
      { rateType: 'weekend', startDate: null, endDate: null, price: 6500, priority: 5, isActive: true },
    ]
    expect(resolveApplicableRate(rates, '2026-08-01')).toBe(6500)
  })

  it('ignores a date-scoped rate plan outside its range', () => {
    const rates: TestRate[] = [
      { rateType: 'base', startDate: null, endDate: null, price: 5000, priority: 0, isActive: true },
      { rateType: 'festival', startDate: '2026-10-20', endDate: '2026-10-25', price: 9000, priority: 10, isActive: true },
    ]
    expect(resolveApplicableRate(rates, '2026-08-01')).toBe(5000)
  })

  it('applies a date-scoped rate plan when the date falls inside its range', () => {
    const rates: TestRate[] = [
      { rateType: 'base', startDate: null, endDate: null, price: 5000, priority: 0, isActive: true },
      { rateType: 'festival', startDate: '2026-10-20', endDate: '2026-10-25', price: 9000, priority: 10, isActive: true },
    ]
    expect(resolveApplicableRate(rates, '2026-10-22')).toBe(9000)
  })

  it('breaks equal-priority ties by rate-type specificity (festival beats seasonal)', () => {
    const rates: TestRate[] = [
      { rateType: 'seasonal', startDate: '2026-10-01', endDate: '2026-10-31', price: 7000, priority: 5, isActive: true },
      { rateType: 'festival', startDate: '2026-10-20', endDate: '2026-10-25', price: 9000, priority: 5, isActive: true },
    ]
    expect(resolveApplicableRate(rates, '2026-10-22')).toBe(9000)
  })

  it('ignores inactive rate plans even if their date range matches', () => {
    const rates: TestRate[] = [
      { rateType: 'base', startDate: null, endDate: null, price: 5000, priority: 0, isActive: true },
      { rateType: 'promotional', startDate: null, endDate: null, price: 1000, priority: 100, isActive: false },
    ]
    expect(resolveApplicableRate(rates, '2026-08-01')).toBe(5000)
  })
})

describe('isValidReservationTransition', () => {
  it('allows inquiry -> tentative', () => {
    expect(isValidReservationTransition('inquiry', 'tentative')).toBe(true)
  })

  it('allows inquiry -> confirmed directly (skipping tentative)', () => {
    expect(isValidReservationTransition('inquiry', 'confirmed')).toBe(true)
  })

  it('rejects checked_out -> confirmed (terminal state)', () => {
    expect(isValidReservationTransition('checked_out', 'confirmed')).toBe(false)
  })

  it('rejects confirmed -> inquiry (no going backwards)', () => {
    expect(isValidReservationTransition('confirmed', 'inquiry')).toBe(false)
  })

  it('allows confirmed -> no_show', () => {
    expect(isValidReservationTransition('confirmed', 'no_show')).toBe(true)
  })

  it('rejects cancelled -> anything (terminal state)', () => {
    expect(isValidReservationTransition('cancelled', 'tentative')).toBe(false)
  })
})
