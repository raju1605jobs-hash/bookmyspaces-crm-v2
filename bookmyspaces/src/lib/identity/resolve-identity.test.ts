// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/identity/resolve-identity.test.ts
// Mocks the Supabase client (no live network access in this sandbox — same
// constraint documented throughout audit/CURRENT_STATUS.md for every prior
// session) to verify the resolution priority and conflict-detection logic.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLeadsTable = {
  phoneMatch: null as { id: string; name: string | null; phone: string; email: string | null } | null,
  emailMatches: [] as Array<{ id: string; name: string | null; phone: string | null; email: string }>,
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'leads') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({ data: mockLeadsTable.phoneMatch }),
          }),
          ilike: (_col: string, _val: string) => ({
            order: () => ({
              limit: () => Promise.resolve({ data: mockLeadsTable.emailMatches }),
            }),
          }),
        }),
      }
    },
  }),
}))

import { resolveIdentity } from './resolve-identity'

describe('resolveIdentity', () => {
  beforeEach(() => {
    mockLeadsTable.phoneMatch = null
    mockLeadsTable.emailMatches = []
  })

  it('returns null when no identifiers are given', async () => {
    expect(await resolveIdentity({})).toBeNull()
  })

  it('matches on phone first when both phone and email are given and phone matches', async () => {
    mockLeadsTable.phoneMatch = { id: 'lead-1', name: 'Priya', phone: '+919876543210', email: 'priya@example.com' }

    const result = await resolveIdentity({ phone: '+919876543210', email: 'priya@example.com' })

    expect(result).not.toBeNull()
    expect(result!.matchedOn).toBe('phone')
    expect(result!.leadId).toBe('lead-1')
    expect(result!.hasConflictingIdentifier).toBe(false)
  })

  it('flags a conflicting identifier when the phone match has a different email on file', async () => {
    mockLeadsTable.phoneMatch = { id: 'lead-1', name: 'Priya', phone: '+919876543210', email: 'old-email@example.com' }

    const result = await resolveIdentity({ phone: '+919876543210', email: 'new-email@example.com' })

    expect(result!.hasConflictingIdentifier).toBe(true)
  })

  it('falls back to email when phone does not match', async () => {
    mockLeadsTable.phoneMatch = null
    mockLeadsTable.emailMatches = [{ id: 'lead-2', name: 'Rahul', phone: '+919999999999', email: 'rahul@example.com' }]

    const result = await resolveIdentity({ phone: '+910000000000', email: 'rahul@example.com' })

    expect(result).not.toBeNull()
    expect(result!.matchedOn).toBe('email')
    expect(result!.leadId).toBe('lead-2')
    // caller-supplied phone disagrees with the matched record's phone
    expect(result!.hasConflictingIdentifier).toBe(true)
  })

  it('returns null when neither phone nor email matches anything', async () => {
    const result = await resolveIdentity({ phone: '+910000000000', email: 'nobody@example.com' })
    expect(result).toBeNull()
  })
})
