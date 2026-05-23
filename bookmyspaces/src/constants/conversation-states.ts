// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/constants/conversation-states.ts
// Deterministic WhatsApp conversation state machine constants.
// Import from here everywhere — single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export enum ConversationState {
  NEW_INQUIRY            = 'NEW_INQUIRY',
  WAITING_FOR_EVENT_TYPE = 'WAITING_FOR_EVENT_TYPE',
  WAITING_FOR_EVENT_DATE = 'WAITING_FOR_EVENT_DATE',
  WAITING_FOR_GUEST_COUNT= 'WAITING_FOR_GUEST_COUNT',
  QUALIFIED              = 'QUALIFIED',
  HANDOFF_TO_OPERATOR    = 'HANDOFF_TO_OPERATOR',
}

export enum SourceChannel {
  WEBSITE   = 'WEBSITE',
  FACEBOOK  = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  UNKNOWN   = 'UNKNOWN',
}

export enum MessageDirection {
  INBOUND  = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageStatus {
  PENDING   = 'pending',
  SENT      = 'sent',
  DELIVERED = 'delivered',
  READ      = 'read',
  FAILED    = 'failed',
}

/** Ordered list of states for progress tracking */
export const STATE_SEQUENCE: ConversationState[] = [
  ConversationState.NEW_INQUIRY,
  ConversationState.WAITING_FOR_EVENT_TYPE,
  ConversationState.WAITING_FOR_EVENT_DATE,
  ConversationState.WAITING_FOR_GUEST_COUNT,
  ConversationState.QUALIFIED,
  ConversationState.HANDOFF_TO_OPERATOR,
]

/** States where we are still collecting data */
export const COLLECTING_STATES = new Set<ConversationState>([
  ConversationState.NEW_INQUIRY,
  ConversationState.WAITING_FOR_EVENT_TYPE,
  ConversationState.WAITING_FOR_EVENT_DATE,
  ConversationState.WAITING_FOR_GUEST_COUNT,
])

/** Terminal states — no more automated responses */
export const TERMINAL_STATES = new Set<ConversationState>([
  ConversationState.QUALIFIED,
  ConversationState.HANDOFF_TO_OPERATOR,
])
