import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  activeRows: [] as Array<Record<string, unknown>>,
  bySlugRow: null as Record<string, unknown> | null,
}

const inventoryState = {
  rows: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'inventory_items') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: inventoryState.rows, error: null }) }),
          }),
        }
      }
      return {
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
      }
    },
  }),
}))

import { listActiveProperties, getPropertyBySlug, listActiveInventoryItems } from './property-service'

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

describe('listActiveInventoryItems', () => {
  beforeEach(() => { inventoryState.rows = [] })

  it('maps inventory rows and their embedded property name/slug', async () => {
    inventoryState.rows = [{
      id: 'item-1', property_id: 'prop-1', inventory_type: 'room', name: 'Deluxe Room 101',
      description: null, max_occupancy: 3, base_capacity: 2, is_active: true,
      properties: { name: 'Skyline Serenity', slug: 'skyline-serenity' },
    }]

    const result = await listActiveInventoryItems()

    expect(result).toEqual([{
      id: 'item-1', propertyId: 'prop-1', inventoryType: 'room', name: 'Deluxe Room 101',
      description: null, maxOccupancy: 3, baseCapacity: 2, isActive: true,
      propertyName: 'Skyline Serenity', propertySlug: 'skyline-serenity',
    }])
  })

  it('falls back gracefully when the embedded property is missing', async () => {
    inventoryState.rows = [{
      id: 'item-2', property_id: 'prop-2', inventory_type: 'suite', name: 'Suite A',
      description: null, max_occupancy: null, base_capacity: null, is_active: true,
      properties: null,
    }]

    const result = await listActiveInventoryItems()

    expect(result[0].propertyName).toBe('Unknown property')
    expect(result[0].propertySlug).toBe('')
  })

  it('returns an empty array when there is no active inventory', async () => {
    expect(await listActiveInventoryItems()).toEqual([])
  })
})
