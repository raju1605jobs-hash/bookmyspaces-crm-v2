// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/pricing/pricing-service.ts
// V3 Day 2 — Pricing Engine integration
//
// A single place to ask "what does this cost right now" from. Built on top
// of Day 1's resolveApplicableRate() (src/types/reservation.ts) for the new
// rate_plans/inventory_items schema — but that schema isn't live yet
// (supabase/migrations/012_v3_foundation_schema.sql is drafted, not applied;
// see audit/DAY2_EXECUTION_REPORT.md). So this service also exposes a
// getPackagePrice() path against the EXISTING, LIVE `packages` table
// (base_price column, already used by src/app/api/whatsapp/webhook/route.ts's
// buildPricingReply()) — real, usable today, not blocked on the migration.
//
// Deliberately does NOT touch src/lib/ai.ts's SYSTEM_PROMPT. That constant
// has hardcoded package pricing (Silver/Gold/Platinum) that this file's
// checkSystemPromptPricingDrift() can detect going stale against — but
// rewriting SYSTEM_PROMPT itself changes the live AI chat's exact wording
// and behavior in a way this sandbox has no way to verify (no live chat
// testing path). That's Phase 3 (AI Orchestrator) work per the architecture
// review, not something to do blind today. See
// audit/DAY2_EXECUTION_REPORT.md for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { resolveApplicableRate, type RatePlan } from '@/types/reservation'

export interface PackagePrice {
  name: string
  basePrice: number
  maxGuests: number
  durationHours: number
  isPopular: boolean
}

/**
 * Live package pricing from the `packages` table — the same source
 * buildPricingReply() in the WhatsApp webhook already queries. Centralized
 * here so future callers (Reservation quote flow, AI context builder) have
 * one function to call instead of each writing their own Supabase query,
 * per "all pricing should flow through the Pricing Engine."
 */
export async function getActivePackagePrices(): Promise<PackagePrice[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('packages')
    .select('name, base_price, max_guests, duration_hours, is_popular')
    .eq('is_active', true)
    .order('tier', { ascending: true })

  if (error || !data) return []

  return data.map((p) => ({
    name: p.name,
    basePrice: Number(p.base_price) || 0,
    maxGuests: p.max_guests,
    durationHours: p.duration_hours,
    isPopular: Boolean(p.is_popular),
  }))
}

/**
 * Pricing for the new Reservation/Inventory model (rate_plans table,
 * supabase/migrations/012_v3_foundation_schema.sql — not yet live). Pure
 * pass-through to resolveApplicableRate(); this function's only job is to
 * be the one place that fetches rate_plans from the database, so the actual
 * selection logic (already tested in src/types/reservation.test.ts) isn't
 * duplicated at every call site.
 */
export async function getInventoryItemRate(inventoryItemId: string, date: string): Promise<number | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('rate_plans')
    .select('rate_type, start_date, end_date, price, priority, is_active')
    .eq('inventory_item_id', inventoryItemId)

  if (error || !data) return null

  const ratePlans: Pick<RatePlan, 'rateType' | 'startDate' | 'endDate' | 'price' | 'priority' | 'isActive'>[] = data.map((rp) => ({
    rateType: rp.rate_type,
    startDate: rp.start_date,
    endDate: rp.end_date,
    price: Number(rp.price),
    priority: rp.priority,
    isActive: rp.is_active,
  }))

  return resolveApplicableRate(ratePlans, date)
}

// ─── Drift detection ─────────────────────────────────────────────────────────

/**
 * The exact figures hardcoded in src/lib/ai.ts's SYSTEM_PROMPT today
 * (Silver/Gold/Platinum, Rs42000/50000/59500). Kept here, not in ai.ts, so
 * checking for drift doesn't require importing the entire AI module (which
 * throws at import time if ANTHROPIC_API_KEY isn't set — see getAnthropic()
 * lazy-init comment in ai.ts). If SYSTEM_PROMPT's numbers ever change, this
 * reference needs a matching update — that coupling is inherent to checking
 * for drift against a hardcoded string at all, and goes away once
 * SYSTEM_PROMPT itself is generated from `packages` (Phase 3).
 */
const HARDCODED_SYSTEM_PROMPT_PRICES: Record<string, number> = {
  Silver: 42000,
  Gold: 50000,
  Platinum: 59500,
}

export interface PricingDrift {
  packageName: string
  hardcodedPrice: number
  livePrice: number
}

/**
 * Compares the hardcoded SYSTEM_PROMPT figures against live packages.base_price.
 * Returns an empty array if nothing has drifted. This is a detection/
 * monitoring function only — it does not change SYSTEM_PROMPT or any other
 * behavior. Addresses the architecture review's own flagged risk: "Existing
 * hardcoded pricing in SYSTEM_PROMPT may already be stale vs. live
 * packages.base_price — worth checking before Phase 3 even starts."
 */
export async function checkSystemPromptPricingDrift(): Promise<PricingDrift[]> {
  const livePackages = await getActivePackagePrices()
  const drifts: PricingDrift[] = []

  for (const [name, hardcodedPrice] of Object.entries(HARDCODED_SYSTEM_PROMPT_PRICES)) {
    const live = livePackages.find((p) => p.name === name)
    if (live && live.basePrice !== hardcodedPrice) {
      drifts.push({ packageName: name, hardcodedPrice, livePrice: live.basePrice })
    }
  }

  return drifts
}
