// src/modules/leads/types.ts
// Central type definitions for the Phase 2 sales operating layer.
// These are the ONLY source of truth for lead/follow-up shapes.
// Import from here, never redeclare inline.

// ─── Lead Stage ───────────────────────────────────────────────────────────────

export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATING',
  'PROPOSAL_SENT',
  'VISIT_SCHEDULED',
  'CONFIRMED',
  'LOST',
] as const;

export type LeadStage = typeof LEAD_STAGES[number];

export const LEAD_TEMPERATURES = ['HOT', 'WARM', 'COLD'] as const;
export type LeadTemperature = typeof LEAD_TEMPERATURES[number];

export const URGENCY_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type UrgencyLevel = typeof URGENCY_LEVELS[number];

// ─── Valid stage transitions ──────────────────────────────────────────────────
// A lead may only move to stages listed in this map.
// Keys: current stage. Values: allowed next stages.

export const VALID_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  NEW             : ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED       : ['QUALIFIED', 'NEGOTIATING', 'LOST'],
  QUALIFIED       : ['NEGOTIATING', 'PROPOSAL_SENT', 'LOST'],
  NEGOTIATING     : ['PROPOSAL_SENT', 'VISIT_SCHEDULED', 'CONFIRMED', 'LOST'],
  PROPOSAL_SENT   : ['VISIT_SCHEDULED', 'NEGOTIATING', 'CONFIRMED', 'LOST'],
  VISIT_SCHEDULED : ['CONFIRMED', 'NEGOTIATING', 'LOST'],
  CONFIRMED       : [],          // terminal — no further transitions
  LOST            : ['NEW'],     // allow re-entry for revived leads
};

// ─── Lead (full DB shape) ─────────────────────────────────────────────────────

export interface Lead {
  id                  : string;
  created_at          : string;
  updated_at          : string;

  // Contact
  name                : string | null;
  phone               : string | null;
  email               : string | null;

  // Event
  event_type          : string | null;
  event_date          : string | null;
  guest_count         : number | null;
  budget              : string | null;
  special_requirements: string | null;
  venue               : string | null;
  occasion            : string | null;

  // CRM pipeline (original status column — preserved)
  status              : string;

  // Phase 2: Sales stage
  lead_stage          : LeadStage | null;

  // Source + assignment
  source              : string;
  assigned_to         : string | null;
  notes               : string | null;

  // Phase 1: Scoring
  ai_score            : number | null;
  lead_temperature    : LeadTemperature | null;
  urgency_level       : UrgencyLevel | null;
  estimated_revenue   : number | null;
  score_breakdown     : Record<string, unknown> | null;
  scored_at           : string | null;
  tags                : string[];

  // Phase 2: Follow-up
  last_follow_up_at   : string | null;
  next_follow_up_at   : string | null;
  follow_up_count     : number;

  // Phase 2: Escalation
  escalation_required : boolean;
  escalation_reason   : string | null;
  escalated_at        : string | null;

  // WhatsApp
  whatsapp_opted_in   : boolean;
  last_contacted_at   : string | null;
}

// ─── Follow-up Queue Entry ────────────────────────────────────────────────────

export interface FollowUpQueueItem {
  id                : string;
  created_at        : string;
  updated_at        : string;

  lead_id           : string;
  scheduled_at      : string;
  message           : string;
  message_type      : 'session' | 'template';

  status            : 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
  attempts          : number;
  max_attempts      : number;
  last_attempted_at : string | null;
  next_retry_at     : string | null;
  error             : string | null;

  trigger_reason    : string | null;
  metadata          : Record<string, unknown>;
}

// ─── Stage Transition ─────────────────────────────────────────────────────────

export interface StageTransition {
  id           : string;
  created_at   : string;

  lead_id      : string;
  from_stage   : LeadStage | null;
  to_stage     : LeadStage;
  reason       : string | null;
  performed_by : string;
  metadata     : Record<string, unknown>;
}

// ─── Follow-up schedule result ────────────────────────────────────────────────

export interface ScheduleResult {
  success      : boolean;
  queued       : number;
  skipped      : number;
  errors       : string[];
}

// ─── Escalation result ────────────────────────────────────────────────────────

export interface EscalationResult {
  escalated    : boolean;
  reason       : string | null;
  notified     : boolean;
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export interface PipelineStat {
  lead_stage         : LeadStage;
  lead_temperature   : LeadTemperature | null;
  lead_count         : number;
  avg_score          : number;
  total_pipeline_value: number;
  escalation_count   : number;
  new_today          : number;
}

export interface DashboardSummary {
  total_leads         : number;
  hot_leads           : number;
  stale_hot_leads     : number;
  follow_ups_due      : number;
  escalations_pending : number;
  total_pipeline_value: number;
  confirmed_revenue   : number;
  conversion_rate     : number;
  pipeline            : PipelineStat[];
}
