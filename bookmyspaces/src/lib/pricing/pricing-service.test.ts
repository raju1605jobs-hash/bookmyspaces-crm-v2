import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPackagesTable = {
  rows: [] as Array<{ name: string; base_price: number; max_guests: number; duration_hours: number; is_popular: boolean }>,
}
const mockRatePlansTable = {
  rows: [] as Array<{ rate_type: string; start_date: string | null; end_date: string | null; price: number; priority: number; is_active: boolean }>,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'packages') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockPackagesTable.rows, error: null }),
            }),
          }),
        }
      }
      if (table === 'rate_plans') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: mockRatePlansTable.rows, error: null }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

import { getActivePackagePrices, getInventoryItemRate, checkSystemPromptPricingDrift } from './pricing-service'

describe('getActivePackagePrices', () => {
  beforeEach(() => {
    mockPackagesTable.rows = []
  })

  it('maps live packages rows to PackagePrice shape', async () => {
    mockPackagesTable.rows = [
      { name: 'Silver', base_price: 42000, max_guests: 60, duration_hours: 4, is_popular: false },
      { name: 'Gold', base_price: 50000, max_guests: 60, duration_hours: 4, is_popular: true },
    ]

    const result = await getActivePackagePrices()

    expect(result).toEqual([
      { name: 'Silver', basePrice: 42000, maxGuests: 60, durationHours: 4, isPopular: false },
      { name: 'Gold', basePrice: 50000, maxGuests: 60, durationHours: 4, isPopular: true },
    ])
  })

  it('returns an empty array when the table is empty', async () => {
    expect(await getActivePackagePrices()).toEqual([])
  })
})

describe('getInventoryItemRate', () => {
  beforeEach(() => {
    mockRatePlansTable.rows = []
  })

  it('resolves the applicable rate from live rate_plans rows', async () => {
    mockRatePlansTable.rows = [
      { rate_type: 'base', start_date: null, end_date: null, price: 5000, priority: 0, is_active: true },
      { rate_type: 'weekend', start_date: null, end_date: null, price: 6500, priority: 5, is_active: true },
    ]

    expect(await getInventoryItemRate('item-1', '2026-08-01')).toBe(6500)
  })

  it('returns null when there are no rate plans', async () => {
    expect(await getInventoryItemRate('item-1', '2026-08-01')).toBeNull()
  })
})

describe('checkSystemPromptPricingDrift', () => {
  beforeEach(() => {
    mockPackagesTable.rows = []
  })

  it('reports no drift when live prices match the hardcoded SYSTEM_PROMPT figures', async () => {
    mockPackagesTable.rows = [
      { name: 'Silver', base_price: 42000, max_guests: 60, duration_hours: 4, is_popular: false },
      { name: 'Gold', base_price: 50000, max_guests: 60, duration_hours: 4, is_popular: true },
      { name: 'Platinum', base_price: 59500, max_guests: 60, duration_hours: 5, is_popular: false },
    ]

    expect(await checkSystemPromptPricingDrift()).toEqual([])
  })

  it('reports drift when a live price has changed since SYSTEM_PROMPT was written', async () => {
    mockPackagesTable.rows = [
      { name: 'Silver', base_price: 45000, max_guests: 60, duration_hours: 4, is_popular: false },
    ]

    const drifts = await checkSystemPromptPricingDrift()

    expect(drifts).toEqual([{ packageName: 'Silver', hardcodedPrice: 42000, livePrice: 45000 }])
  })

  it('does not report drift for a package that does not exist live (nothing to compare)', async () => {
    mockPackagesTable.rows = []
    expect(await checkSystemPromptPricingDrift()).toEqual([])
  })
})
