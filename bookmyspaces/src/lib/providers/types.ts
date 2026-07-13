// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/providers/types.ts
// V3 FOUNDATION — Provider Framework
//
// Common abstraction layer for every external system this platform talks to.
// This is a contracts-only file: interfaces and shared value types, no
// implementations. Existing concrete implementations (src/lib/email/*,
// src/lib/whatsapp/*, src/lib/ai.ts) are NOT rewritten here — per the
// architecture review (audit/PHASE1_ARCHITECTURE_REVIEW_OMNICHANNEL.md,
// Section 5), the plan is to have those existing modules implement these
// interfaces incrementally, not to replace them in one pass.
//
// Why this file exists now, before any provider implements it: every future
// module (Unified Conversation Service, Reservation <-> OTA sync, AI
// Orchestrator) needs to be written against an interface, not a concrete
// SDK call, or "add a new channel" keeps meaning "edit call sites
// throughout the codebase" (the exact problem Section 1 of the architecture
// review flags as this project's current structural weakness).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared value types ─────────────────────────────────────────────────────

export interface ProviderErrorResult {
  ok: false
  error: {
    code: string
    message: string
    /** Raw provider error, for logging only — never surfaced to end users as-is. */
    cause?: unknown
    /** True if the caller should retry (rate limit, transient network error). */
    retryable: boolean
  }
}

export type ProviderResponse<T> =
  | { ok: true; data: T }
  | ProviderErrorResult

// ─── Messaging Provider ─────────────────────────────────────────────────────
// Implemented today, informally, by src/lib/whatsapp/send-message.ts and
// src/lib/queue.ts's smartSend(). Formalizing the shape here is what lets
// Facebook Messenger / Instagram DM / a future SMS provider slot in later
// without every call site needing to know which channel it's talking to.

export type MessagingChannel = 'whatsapp' | 'facebook' | 'instagram' | 'sms' | 'website_chat'

export interface OutboundMessage {
  channel: MessagingChannel
  /** Channel-native recipient identifier (E.164 phone, PSID, session id, etc.) */
  recipientId: string
  text?: string
  mediaUrl?: string
  /** Provider-specific template name, e.g. WhatsApp approved templates. */
  templateName?: string
  templateParams?: Record<string, string>
}

export interface SendResult {
  providerMessageId: string
  channel: MessagingChannel
  status: 'sent' | 'queued' | 'failed'
}

export interface MessagingProvider {
  readonly channel: MessagingChannel
  send(message: OutboundMessage): Promise<ProviderResponse<SendResult>>
  /** Verify an inbound webhook payload's signature/authenticity. */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
}

// ─── AI Provider ────────────────────────────────────────────────────────────
// Implemented today by src/lib/ai.ts's chatWithAI() (Claude primary, OpenAI
// fallback) — already channel-agnostic per the architecture review's finding.
// This interface names that existing behavior so new orchestration code
// depends on the interface, not the concrete Anthropic/OpenAI SDK calls.

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AICompletionRequest {
  messages: AIMessage[]
  /** Injected by the AI Orchestrator (Section 7 of the architecture review) — knowledge chunks, customer memory, etc. Kept opaque here on purpose. */
  context?: Record<string, unknown>
  maxTokens?: number
}

export interface AICompletionResult {
  text: string
  model: string
  /** Composite heuristic confidence score, 0-1 — see architecture review Section 7 for why this isn't a native model output. */
  confidence?: number
}

export interface AIProvider {
  readonly name: string
  complete(request: AICompletionRequest): Promise<ProviderResponse<AICompletionResult>>
}

// ─── Email Provider ─────────────────────────────────────────────────────────
// Implemented today by src/lib/email/provider.ts (Resend). That file already
// has almost exactly this shape — this interface formalizes it so it can be
// referenced from provider-agnostic code without importing Resend directly.

export interface EmailMessage {
  to: string
  from?: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<ProviderResponse<{ providerMessageId: string }>>
}

// ─── Payment Provider ───────────────────────────────────────────────────────
// No concrete implementation exists yet in this codebase (payments today are
// tracked as records, not processed through a gateway). Interface included
// now so the Reservation <-> Payment integration (architecture review Phase 6)
// has a contract to design against, without committing to a specific gateway.

export interface PaymentIntentRequest {
  amountMinor: number // smallest currency unit (paise for INR)
  currency: 'INR'
  referenceType: 'reservation' | 'proposal' | 'invoice'
  referenceId: string
  customerEmail?: string
}

export interface PaymentIntentResult {
  providerPaymentId: string
  status: 'created' | 'pending' | 'succeeded' | 'failed'
  redirectUrl?: string
}

export interface PaymentProvider {
  readonly name: string
  createIntent(request: PaymentIntentRequest): Promise<ProviderResponse<PaymentIntentResult>>
  verifyWebhookSignature(headers: Record<string, string>, rawBody: string): boolean
}

// ─── Storage Provider ───────────────────────────────────────────────────────
// Supabase Storage is already in use (proposal PDFs, images). Interface named
// here so storage calls can be abstracted the same way as every other
// provider, per the master spec's "provider abstraction" requirement —
// not because a storage migration is planned.

export interface StorageProvider {
  readonly name: string
  upload(path: string, content: Buffer | Blob, contentType: string): Promise<ProviderResponse<{ url: string }>>
  getSignedUrl(path: string, expiresInSeconds: number): Promise<ProviderResponse<{ url: string }>>
}

// ─── OTA / Channel Manager Provider ─────────────────────────────────────────
// No implementation planned in the near term — see
// BOOKMYSPACES_V3_MASTER_SPECIFICATION.md's "OTA / Channel Manager
// Integration (Future)" section. Interface stubbed now purely so the
// Reservation domain model (src/types/reservation.ts) has a stable shape to
// report availability/rates against later, without a schema change.

export interface OTAProvider {
  readonly name: 'booking.com' | 'agoda' | 'expedia' | 'airbnb'
  pushAvailability(inventoryItemId: string, dates: { date: string; available: number }[]): Promise<ProviderResponse<void>>
  pushRates(inventoryItemId: string, dates: { date: string; rateMinor: number }[]): Promise<ProviderResponse<void>>
  pullReservations(since: string): Promise<ProviderResponse<Array<{ externalReservationId: string; raw: unknown }>>>
}

// ─── Marketing Provider ─────────────────────────────────────────────────────
// No implementation yet. Named per BOOKMYSPACES_V3_MASTER_SPECIFICATION.md's
// Digital Marketing & Omnichannel Campaign Management section. Kept
// deliberately minimal — real scope (OAuth flows, per-platform content
// constraints) is a dedicated future phase, not part of today's foundation.

export interface MarketingProvider {
  readonly platform: 'facebook_page' | 'instagram_business' | 'linkedin_company' | 'google_business'
  publishPost(content: { text: string; mediaUrls?: string[] }): Promise<ProviderResponse<{ providerPostId: string }>>
}
