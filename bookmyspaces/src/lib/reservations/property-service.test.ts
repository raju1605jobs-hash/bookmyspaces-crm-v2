import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  activeRows: [] as Array<Record<string, unknown>>,
  bySlugRow: null as Record<string, unknown> | null,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string) => {
          if (col === 'is_active') {
            return { order: () => Promise.resolve({ data: state.activeRows, error: null }) }
          }
          if (col === 'slug') {
            return { maybeSingle: () => Promise.resolve({ data: state.bySlugRow, error: null }) }
          }
          throw new Error(`unexpected eq column: ${col}`)
        },
      }),
    }),
  }),
}))

import { listActiveProperties, getPropertyBySlug } from './property-service'

const rawRow = {
  id: 'prop-1', name: 'Skyline Serenity', slug: 'skyline-serenity', address: null, city: 'Kolkata',
  gst_number: null, google_maps_url: null, contact_phone: null, contact_email: null,
  amenities: ['wifi', 'parking'], images: [], policies: null, business_hours: {}, is_active: true,
}

describe('listActiveProperties', () => {
  beforeEach(() => { state.activeRows = [] })

  it('maps snake_case rows to the Property domain type', async () => {
    state.activeRows = [rawRow]

    const result = await listActiveProperties()

    expect(result).toEqual([{
      id: 'prop-1', name: 'Skyline Serenity', slug: 'skyline-serenity', address: null, city: 'Kolkata',
      gstNumber: null, googleMapsUrl: null, contactPhone: null, contactEmail: null,
      amenities: ['wifi', 'parking'], images: [], policies: null, businessHours: {}, isActive: true,
    }])
  })

  it('returns an empty array when there are no active properties', async () => {
    expect(await listActiveProperties()).toEqual([])
  })
})

describe('getPropertyBySlug', () => {
  beforeEach(() => { state.bySlugRow = null })

  it('returns the mapped property when found', async () => {
    state.bySlugRow = rawRow
    const result = await getPropertyBySlug('skyline-serenity')
    expect(result?.name).toBe('Skyline Serenity')
  })

  it('returns null when no property matches the slug', async () => {
    expect(await getPropertyBySlug('does-not-exist')).toBeNull()
  })
})
