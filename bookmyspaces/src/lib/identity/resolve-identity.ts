// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/identity/resolve-identity.ts
// V3 FOUNDATION — Identity Resolution
//
// Generalizes src/lib/whatsapp/lead-resolver.ts's resolveLeadByPhone() into a
// multi-identifier resolver, per architecture review Section 2 ("Reuse with
// extension") and Section 6 ("change resolveLeadByPhone() into a
// multi-identifier resolver").
//
// Deliberately does NOT touch or replace resolveLeadByPhone() itself — that
// function is live in the production WhatsApp webhook path, has WhatsApp-
// specific side effects (whatsapp_opted_in, whatsapp_last_message_at,
// source_channel overwrite semantics), and per this session's operating
// rules ("do not rewrite completed modules"), stays exactly as-is.
//
// This module adds a read-oriented, channel-agnostic layer on top: given
// whatever identifiers a new inbound message/channel actually has (phone,
// email, or both), find the single best-matching existing lead without
// creating a new one. Channel-specific adapters (WhatsApp today, Website
// Chat / Email next per the architecture review's Phase 1/2 order) decide
// what to do with the result — including whether/how to create a new lead,
// which stays channel-specific for now because the "leads vs. customers"
// data model decision (architecture review, Open Decision #1) is still
// unresolved. Auto-creating or auto-merging records here would be deciding
// that question implicitly, which this module intentionally avoids.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizePhone } from '@/lib/whatsapp/normalize-phone'

export interface IdentityLookup {
  phone?: string | null
  email?: string | null
}

export interface ResolvedIdentity {
  leadId: string
  name: string | null
  phone: string | null
  email: string | null
  /** Which identifier produced the match. */
  matchedOn: 'phone' | 'email'
  /**
   * True when the lookup found a match on one identifier, but the record's
   * other identifier disagrees with (or is missing) what the caller passed
   * in. Surfaced so callers can decide whether to update the record or flag
   * it for review — this module does not auto-reconcile identity data.
   */
  hasConflictingIdentifier: boolean
}

/**
 * Read-only lookup across the existing `leads` table by phone and/or email.
 * Returns the best single match, or null if nothing matches either
 * identifier. Never creates or modifies a record.
 *
 * Resolution order: phone first (has a UNIQUE constraint — the more
 * reliable key), then email (not unique on this table; if multiple leads
 * share an email, the most recently updated one is returned and this is
 * surfaced via hasConflictingIdentifier so callers don't silently trust a
 * possibly-ambiguous match).
 */
export async function resolveIdentity(lookup: IdentityLookup): Promise<ResolvedIdentity | null> {
  // Normalize to the same canonical, digits-only phone format every write
  // path now converges on (src/lib/whatsapp/normalize-phone.ts). Without
  // this, a caller passing "+91 98765 43210" or "9876543210" would never
  // match a lead already stored as "919876543210" (or vice versa) — an
  // exact-string match against differently-formatted input, even though
  // it's the same phone number. Bug found and fixed in Sprint 5 — see
  // audit/SPRINT5_GO_LIVE_REPORT.md.
  const phone = lookup.phone?.trim() ? normalizePhone(lookup.phone) : null
  const email = lookup.email?.trim().toLowerCase() || null

  if (!phone && !email) return null

  const supabase = getSupabaseAdmin()

  if (phone) {
    const { data } = await supabase
      .from('leads')
      .select('id, name, phone, email')
      .eq('phone', phone)
      .maybeSingle()

    if (data) {
      const recordEmail = data.email?.trim().toLowerCase() || null
      return {
        leadId: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        matchedOn: 'phone',
        hasConflictingIdentifier: Boolean(email && recordEmail && email !== recordEmail),
      }
    }
  }

  if (email) {
    const { data } = await supabase
      .from('leads')
      .select('id, name, phone, email')
      .ilike('email', email)
      .order('updated_at', { ascending: false })
      .limit(1)

    const match = data?.[0]
    if (match) {
      return {
        leadId: match.id,
        name: match.name,
        phone: match.phone,
        email: match.email,
        matchedOn: 'email',
        // Ambiguous by construction if the caller also supplied a phone that
        // didn't match above (we'd have returned already if it had).
        hasConflictingIdentifier: Boolean(phone && match.phone && match.phone !== phone),
      }
    }
  }

  return null
}
