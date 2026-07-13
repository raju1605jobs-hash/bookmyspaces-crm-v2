// src/lib/validation.ts
// ─────────────────────────────────────────────────────────────────────────────
// ISS-005 (audit/MASTER_ISSUE_REGISTER.csv): none of the 31 API routes validated
// their input shape before touching the database — malformed types (e.g. a
// string where a number was expected) surfaced as opaque Postgres errors, and
// PATCH-style routes that spread `...body` straight into a Supabase `.update()`
// call were open to mass assignment (a caller could set columns the UI never
// exposes, like `ai_score` or `created_at`, just by including them in the
// request body).
//
// This module is the shared helper + schema library. Routes import a schema
// from here and call `parseBody()`, which returns either validated data or a
// ready-to-return 400 NextResponse — callers never hand-roll validation error
// shapes. Scoped rollout: applied first to the highest write-risk routes
// (leads create/edit, lead stage transitions — the two flows this session's
// QA pass covered) as the reference pattern; the remaining ~29 routes are
// listed as follow-up work in audit/OPEN_ISSUES.md rather than claimed done
// here, since applying it blind to all 31 without individually verifying each
// route's actual expected shape would risk breaking routes this session
// didn't otherwise touch or verify.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }),
    }
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid request body', issues }, { status: 400 }),
    }
  }

  return { ok: true, data: result.data }
}

// ─── Leads ──────────────────────────────────────────────────────────────────

const uuid = z.string().uuid({ message: 'must be a valid UUID' })

export const createLeadSchema = z.object({
  name                : z.string().trim().min(1).max(200).nullish(),
  phone               : z.string().trim().min(6).max(20).nullish(),
  email               : z.string().trim().email().nullish().or(z.literal('')),
  event_type          : z.string().trim().max(100).nullish(),
  event_date          : z.string().trim().nullish(), // date-ish string; DB column is permissive, matches existing behavior
  guest_count         : z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullish(),
  budget              : z.string().trim().max(100).nullish(),
  special_requirements: z.string().trim().max(2000).nullish(),
  venue               : z.string().trim().max(200).nullish(),
  source              : z.string().trim().max(50).nullish(),
  status              : z.string().trim().max(50).nullish(),
  assigned_to         : z.string().trim().max(200).nullish(),
  notes               : z.string().trim().max(2000).nullish(),
})

// PATCH /api/leads allow-list — deliberately excludes columns that have their
// own dedicated, validated write path (lead_stage → /api/leads/[id]/stage) or
// that should never be client-writable (id, created_at, ai_score and other
// scoring-engine-owned fields). Anything not listed here is REJECTED with a
// 400, not silently dropped — a silent drop would hide the same class of bug
// this session spent most of its time on: a write the caller believes
// succeeded quietly doing nothing.
export const updateLeadSchema = z.object({
  id                  : uuid,
  name                : z.string().trim().min(1).max(200).nullish(),
  phone               : z.string().trim().min(6).max(20).nullish(),
  email               : z.string().trim().email().nullish().or(z.literal('')),
  event_type          : z.string().trim().max(100).nullish(),
  event_date          : z.string().trim().nullish(),
  guest_count         : z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullish(),
  budget              : z.string().trim().max(100).nullish(),
  special_requirements: z.string().trim().max(2000).nullish(),
  venue               : z.string().trim().max(200).nullish(),
  source              : z.string().trim().max(50).nullish(),
  status              : z.string().trim().max(50).nullish(),
  assigned_to         : z.string().trim().max(200).nullish(),
  notes               : z.string().trim().max(2000).nullish(),
}).strict().partial({
  name: true, phone: true, email: true, event_type: true, event_date: true,
  guest_count: true, budget: true, special_requirements: true, venue: true,
  source: true, status: true, assigned_to: true, notes: true,
})

export const leadStageBodySchema = z.object({
  stage : z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'PROPOSAL_SENT', 'VISIT_SCHEDULED', 'CONFIRMED', 'LOST']),
  reason: z.string().trim().max(500).optional(),
  force : z.boolean().optional(),
})

// ─── Reservations (V3 Day 6 — Operator Experience sprint) ──────────────────
// Same "validate before touching the database" rule as leads above, applied
// to the new Reservation API routes exposing Day 2/4's reservation-workflow.ts.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date')

export const checkAvailabilitySchema = z.object({
  inventoryItemId: uuid,
  checkInDate    : isoDate,
  checkOutDate   : isoDate,
  roomCount      : z.number().int().positive().max(50).nullish(),
})

export const createReservationSchema = z.object({
  customerId     : uuid.nullish(),
  guestName      : z.string().trim().min(1).max(200),
  guestMobile    : z.string().trim().min(6).max(20).nullish(),
  guestEmail     : z.string().trim().email().nullish().or(z.literal('')),
  propertyId     : uuid,
  inventoryItemId: uuid,
  checkInDate    : isoDate,
  checkOutDate   : isoDate,
  adults         : z.number().int().positive().max(50).nullish(),
  children       : z.number().int().min(0).max(50).nullish(),
  roomCount      : z.number().int().positive().max(50).nullish(),
  bookingSource  : z.enum([
    'direct', 'website', 'whatsapp', 'phone', 'walk_in', 'referral',
    'booking_com', 'agoda', 'expedia', 'airbnb', 'other',
  ]).nullish(),
  specialRequests: z.string().trim().max(2000).nullish(),
  crmLeadId      : uuid.nullish(),
})

export const reservationStatusActionSchema = z.object({
  action   : z.enum(['confirm', 'cancel', 'check_in', 'check_out']),
  reason   : z.string().trim().max(500).nullish(),
  crmLeadId: uuid.nullish(),
})
