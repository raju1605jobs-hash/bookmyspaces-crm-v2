// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/reservations/property-service.ts
// V3 Day 2 — Reservation Platform foundation, business logic layer.
//
// NOT LIVE-TESTABLE YET: reads from the `properties` table, which exists
// only in the drafted supabase/migrations/012_v3_foundation_schema.sql
// (not applied — this sandbox has no network path to the live Supabase
// project). This file is correct against that schema and against Day 1's
// Property type, and is ready to use the moment that migration is applied;
// it has not been run against a real database. See
// audit/DAY2_EXECUTION_REPORT.md for the full reasoning on why service-layer
// code is being written now rather than waiting for the migration.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import type { Property } from '@/types/reservation'

function mapRow(row: {
  id: string; name: string; slug: string; address: string | null; city: string | null
  gst_number: string | null; google_maps_url: string | null; contact_phone: string | null
  contact_email: string | null; amenities: string[] | null; images: string[] | null
  policies: string | null; business_hours: Record<string, unknown> | null; is_active: boolean
}): Property {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    address: row.address,
    city: row.city,
    gstNumber: row.gst_number,
    googleMapsUrl: row.google_maps_url,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    amenities: row.amenities ?? [],
    images: row.images ?? [],
    policies: row.policies,
    businessHours: row.business_hours ?? {},
    isActive: row.is_active,
  }
}

export async function listActiveProperties(): Promise<Property[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error || !data) return []
  return data.map(mapRow)
}

export async function getPropertyBySlug(slug: string): Promise<Property | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return null
  return mapRow(data)
}
