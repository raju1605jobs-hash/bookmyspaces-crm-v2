// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/api/customers/[id]/route.ts
// V3 Day 6 — Operator Experience sprint.
//
// GET single customer — a thin `leads` lookup by id. There was no
// single-lead detail endpoint anywhere in the codebase before this (only
// list/search via GET /api/leads); the Customer Profile screen needs one.
// Named "customers" (not "leads") to match the product's Customer Profile
// vocabulary, but reads the same `leads` table — the Product-Owner-resolved
// decision (audit/PHASE1_ARCHITECTURE_REVIEW_OMNICHANNEL.md, Open Decision
// #1: extend `leads`, no new `customers` table) means "customer" and "lead"
// are the same row, not two systems to keep in sync.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    return NextResponse.json({ customer: data })
  } catch (error) {
    logger.error('customers/[id]', 'GET failed', error)
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 })
  }
}
