// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/ai/context-builder.ts
// V3 Day 4 — Priority 3: AI Context Builder.
//
// The single place that assembles a structured AIContext object for the AI
// to answer from, per the master specification's "avoid multiple unrelated
// database lookups inside AI providers" requirement. Every field is sourced
// from an existing service, not a new query pattern:
//   - customerProfile          -> `leads` table (direct read; Identity
//                                  Resolution itself, src/lib/identity/
//                                  resolve-identity.ts, is the caller's job —
//                                  this builder takes an already-resolved
//                                  leadId, same "identity resolution stays
//                                  the caller's decision" boundary Day 3's
//                                  Unified Conversation Service uses)
//   - conversationHistory      -> unified_messages (migration 012, NOT LIVE)
//   - reservationHistory       -> reservations (migration 012, NOT LIVE)
//   - proposalHistory          -> `proposals` table (migration 003, LIVE)
//   - customerPreferences      -> `leads` table (LIVE — event_type,
//                                  guest_count, venue, special_requirements)
//   - activePackages / pricing -> src/lib/pricing/pricing-service.ts (LIVE)
//   - knowledgeBaseResults     -> src/lib/knowledge/knowledge-retrieval.ts
//                                  (LIVE infrastructure, Day 4 addition)
//   - businessRules            -> `settings` table (migration 012, NOT LIVE)
//                                  with documented config-over-hardcode
//                                  defaults when unavailable
//
// Sections backed by not-yet-applied migration 012 tables fail closed —
// caught individually, reported via `degraded`, never thrown — so this
// builder is usable today against the live subset (proposals, packages,
// leads, knowledge base) and picks up the rest automatically once migration
// 012 is applied, with no code change required.
//
// Deliberately does NOT call src/lib/ai.ts's chatWithAI() itself — this
// builds the context object; wiring it into an actual AI call is the
// caller's job (Unified Conversation Service's handleInboundMessage()),
// kept separate so this stays testable without mocking the AI provider.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { getActivePackagePrices, checkSystemPromptPricingDrift } from '@/lib/pricing/pricing-service'
import { retrieveKnowledgeByVector } from '@/lib/knowledge/knowledge-retrieval'
import type {
  AIContext,
  BuildAIContextInput,
  CustomerProfile,
  CustomerPreferences,
  ProposalSummary,
  ReservationSummary,
  ConversationHistoryEntry,
  BusinessRules,
} from '@/types/ai-context'

const DEFAULT_BUSINESS_RULES: Omit<BusinessRules, 'isLiveConfig'> = {
  cancellationWindowHours: 48,
  advancePaymentPercent: 30,
  checkInTime: '14:00',
  checkOutTime: '11:00',
}

async function getCustomerProfileAndPreferences(
  leadId: string | null
): Promise<{ profile: CustomerProfile; preferences: CustomerPreferences }> {
  const emptyProfile: CustomerProfile = {
    leadId: null, name: null, phone: null, email: null, status: null, hasConflictingIdentifier: false,
  }
  const emptyPreferences: CustomerPreferences = {
    preferredEventType: null, preferredGuestCount: null, preferredVenue: null, notes: null,
  }

  if (!leadId) return { profile: emptyProfile, preferences: emptyPreferences }

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('leads')
    .select('id, name, phone, email, status, event_type, guest_count, venue, special_requirements')
    .eq('id', leadId)
    .maybeSingle()

  if (!data) return { profile: emptyProfile, preferences: emptyPreferences }

  return {
    profile: {
      leadId: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      status: data.status,
      hasConflictingIdentifier: false,
    },
    preferences: {
      preferredEventType: data.event_type ?? null,
      preferredGuestCount: data.guest_count ?? null,
      preferredVenue: data.venue ?? null,
      notes: data.special_requirements ?? null,
    },
  }
}

async function getProposalHistory(leadId: string | null): Promise<ProposalSummary[]> {
  if (!leadId) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('proposals')
    .select('id, proposal_number, package_name, total_price, status, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !data) return []

  return data.map((p) => ({
    id: p.id,
    proposalNumber: p.proposal_number,
    packageName: p.package_name,
    totalPrice: p.total_price !== null ? Number(p.total_price) : null,
    status: p.status,
    createdAt: p.created_at,
  }))
}

async function getReservationHistory(leadId: string | null): Promise<{ reservations: ReservationSummary[]; degraded: boolean }> {
  if (!leadId) return { reservations: [], degraded: false }
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, status, property_id, check_in_date, check_out_date, final_room_rate')
      .eq('customer_id', leadId)
      .order('check_in_date', { ascending: false })
      .limit(10)

    if (error) return { reservations: [], degraded: true }

    return {
      reservations: (data ?? []).map((r) => ({
        id: r.id,
        status: r.status,
        propertyId: r.property_id,
        checkInDate: r.check_in_date,
        checkOutDate: r.check_out_date,
        finalRoomRate: Number(r.final_room_rate) || 0,
      })),
      degraded: false,
    }
  } catch {
    return { reservations: [], degraded: true }
  }
}

async function getConversationHistory(conversationId: string | null | undefined): Promise<{ history: ConversationHistoryEntry[]; degraded: boolean }> {
  if (!conversationId) return { history: [], degraded: false }
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from('unified_messages')
      .select('direction, sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) return { history: [], degraded: true }

    return {
      history: (data ?? []).map((m) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content ?? '',
        timestamp: m.created_at,
      })),
      degraded: false,
    }
  } catch {
    return { history: [], degraded: true }
  }
}

async function getBusinessRules(): Promise<BusinessRules> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .eq('category', 'business_rules')

    if (error || !data || data.length === 0) {
      return { ...DEFAULT_BUSINESS_RULES, isLiveConfig: false }
    }

    const overrides: Record<string, unknown> = {}
    for (const row of data) overrides[row.key] = row.value

    return {
      cancellationWindowHours: Number(overrides.cancellationWindowHours) || DEFAULT_BUSINESS_RULES.cancellationWindowHours,
      advancePaymentPercent: Number(overrides.advancePaymentPercent) || DEFAULT_BUSINESS_RULES.advancePaymentPercent,
      checkInTime: (overrides.checkInTime as string) || DEFAULT_BUSINESS_RULES.checkInTime,
      checkOutTime: (overrides.checkOutTime as string) || DEFAULT_BUSINESS_RULES.checkOutTime,
      isLiveConfig: true,
    }
  } catch {
    return { ...DEFAULT_BUSINESS_RULES, isLiveConfig: false }
  }
}

/**
 * Assembles one structured AIContext object. Every sub-lookup is
 * independent and individually fault-tolerant — a failure in one section
 * (e.g. reservations, if migration 012 isn't applied yet) never prevents
 * the others from returning real data.
 */
export async function buildAIContext(input: BuildAIContextInput): Promise<AIContext> {
  const [
    { profile, preferences },
    proposalHistory,
    reservationResult,
    conversationResult,
    activePackages,
    pricingDrift,
    knowledgeResults,
    businessRules,
  ] = await Promise.all([
    getCustomerProfileAndPreferences(input.leadId),
    getProposalHistory(input.leadId),
    getReservationHistory(input.leadId),
    getConversationHistory(input.conversationId),
    getActivePackagePrices(),
    checkSystemPromptPricingDrift(),
    retrieveKnowledgeByVector(input.query),
    getBusinessRules(),
  ])

  return {
    customerProfile: profile,
    conversationHistory: conversationResult.history,
    reservationHistory: reservationResult.reservations,
    proposalHistory,
    customerPreferences: preferences,
    activePackages,
    knowledgeBaseResults: knowledgeResults.map((k) => ({
      content: k.content,
      sourceFile: k.sourceFile,
      category: k.category,
      similarity: k.similarity,
    })),
    pricing: { activePackages, pricingDrift },
    businessRules,
    degraded: {
      reservationHistory: reservationResult.degraded,
      conversationHistory: conversationResult.degraded,
    },
  }
}
