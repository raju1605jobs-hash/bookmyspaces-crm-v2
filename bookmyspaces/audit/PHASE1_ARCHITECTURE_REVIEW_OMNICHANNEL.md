
# Phase 1 — Architecture & Design Review
## BookMySpaces CRM → AI-Powered Omnichannel Hospitality Engagement Platform

**Status: Planning only. No code changes made. Awaiting approval before implementation.**

This review is based on a direct read of the current source code, all 11 Supabase migration files, and the project's own audit trail (`audit/COMPLETED_ISSUES.md`, `CURRENT_STATUS.md`). Every claim below is grounded in a specific file read this session, not assumed from the vision document.

---

## 1. Review of Current Project Architecture

**Stack:** Next.js 14.2.5 (App Router), TypeScript, Supabase (Postgres + Auth + Storage), Tailwind, Anthropic Claude (primary AI) with OpenAI fallback, Resend (email), Meta WhatsApp Cloud API, Google Sheets sync.

**Structural pattern:** Route handlers under `src/app/api/**/route.ts` call directly into `src/lib/*.ts` helper modules, which call `getSupabaseAdmin()` (service-role client, bypasses RLS) directly. There is no repository/data-access layer, no service interfaces, and no dependency injection — modules are plain functions imported directly where needed. This is a pragmatic, low-ceremony pattern that has let the team ship fast, but it means "swap the data source" or "add a new channel" today means editing call sites throughout the codebase rather than implementing an interface.

**Two conversation systems already exist, and they are not unified — this is the most important finding for this review.**

| | Website chat | WhatsApp |
|---|---|---|
| Entry point | `src/app/api/chat/route.ts` | `src/app/api/whatsapp/webhook/route.ts` → `src/services/whatsapp/process-inbound.ts` |
| Identity key | `session_id` (random UUID, browser-generated) | `phone` (E.164) |
| Conversation table | `conversations` (JSONB message array in one row) | `whatsapp_conversations` (one row per phone) + `whatsapp_messages` (one row per message) |
| Dedup logic | Bespoke, inline in the route handler: scans up to 500 leads with `phone IS NOT NULL`, normalizes, compares in application code | `resolveLeadByPhone()` in `src/lib/whatsapp/lead-resolver.ts`, single indexed `.eq('phone', phone)` lookup |
| State tracking | None — just a running message array + ad-hoc `extracted_*` columns | Formal deterministic state machine (`ConversationState` enum in `src/constants/conversation-states.ts`) |

Both paths independently call into `src/lib/ai.ts`'s `chatWithAI()` for the actual model call, which **is** channel-agnostic (takes plain message arrays, returns plain text) — this is the one piece of the AI layer that's already reusable as-is. Everything wrapping it (identity resolution, conversation persistence, state tracking) is duplicated and channel-specific.

**Auth:** Solid. `src/middleware.ts` does real Supabase session checks with a public-page allowlist; every staff-facing API route calls `requireAuth()`/`requireRole()` (`src/lib/auth-guard.ts`). This was the subject of significant remediation work already completed (see Section 4) and is a safe foundation to build on.

**AI knowledge base:** `retrieveRelevantKnowledge()` in `src/lib/ai.ts` does a `content.ilike.%keyword%` search over `knowledge_chunks` — simple keyword matching, not vector similarity search, despite the README claiming "RAG / Vector Search" and the schema having a `vector` column with an ivfflat index (`match_knowledge_chunks()` RPC function exists in migration 001/005 but is not called anywhere in `src/lib/ai.ts`). The infrastructure for real RAG exists in the database; the application code takes a shortcut around it.

**Pricing/knowledge is hardcoded, not CRM-editable — contradicts the vision's core requirement.** `SYSTEM_PROMPT` in `src/lib/ai.ts` (lines 26-62) has property names, room rates, and the exact 3-tier rooftop package pricing (Silver Rs42,000 / Gold Rs50,000 / Platinum Rs59,500) written directly into a TypeScript string constant. Separately, a `packages` table already exists (migration 007) with `base_price`, `addons` (JSONB), and — notably — an `ai_description` column explicitly commented "used to inject into AI knowledge base." **That column is never read by any code in the project.** The database was already designed for CRM-editable AI pricing; the AI integration was never finished to actually use it.

**Settings page is non-functional.** `src/app/(crm)/settings/page.tsx` (610 lines) has a full UI for venue info, AI settings, notifications, and WhatsApp config, but `handleSave()` (line 257) writes to `localStorage.setItem('crm_settings', ...)` only. There is no `/api/settings` route, no settings table, and nothing anywhere in the codebase reads `crm_settings` back. Every "Admin Settings" requirement in the vision document needs real backend work, not a wiring fix.

**Analytics/activity logging is fragmented across three tables** with overlapping purposes: `activity_logs` (original, lead-scoped, used everywhere), `activity_events` (added in migration 009, generic entity-scoped, unclear adoption), `analytics_events` (migration 007, has a `track_event()` RPC function, called once from `api/chat/route.ts`). No single table is the canonical "what happened" log.

**Reservations do not exist as hotel-style stays.** The closest existing table, `bookings` (migration 003), is shaped for banquet/event bookings — `event_date`, `event_time`, `venue`, `guest_count`, single `package_name` string — not for multi-night hotel stays with check-in/check-out dates, room types, adults/children counts, or meal plans. This confirms the vision document's instruction to build Reservations as a genuinely new module rather than repurpose `bookings` or `leads`.

---

## 2. Reusable Modules

Reuse **as-is, no changes needed**:

- `src/lib/auth-guard.ts`, `src/middleware.ts`, `src/lib/supabase-server.ts` — auth is solid, all new routes should follow the exact same `requireAuth()`/`requireRole()` pattern
- `src/lib/validation.ts` + `parseBody()` pattern (built this session) — extend with new schemas per new endpoint, same pattern
- `src/lib/email/*` (provider.ts, send.ts, templates.ts) — provider-agnostic email system, already logs to `email_log`; the email channel adapter (Section 6) is a thin wrapper around this, not a rebuild
- `src/lib/ai.ts`'s `chatWithAI()` core model-calling function (not the surrounding lead-extraction logic, which is WhatsApp/website-chat-specific)
- `src/modules/leads/lead-stage-manager.ts` and its `VALID_TRANSITIONS` state-machine pattern — this is the right template for a Reservation status state machine too
- `packages` table and its `addons` JSONB shape — the right foundation for reservation pricing/add-ons, just needs to be actually queried
- `src/lib/logger.ts`, `src/lib/env.ts` (new this session), `src/instrumentation.ts` (new this session)

Reuse **with extension** (do not rebuild):

- `src/lib/whatsapp/*` (conversation-manager, detect-source, lead-resolver) and `src/services/whatsapp/process-inbound.ts` — this is the best existing template for the Unified Conversation Service. Its 7-step pipeline (idempotency check, source detection, identity resolution, conversation get/create, message log, activity log, auto-response) is exactly the shape a channel-agnostic pipeline needs. Generalize the types (`SourceChannel` enum already has room to grow beyond WEBSITE/FACEBOOK/INSTAGRAM), and change `resolveLeadByPhone()` into a multi-identifier resolver (Section 6).
- `conversations` table and `api/chat/route.ts` — the website-chat-specific upsert/dedup logic here should be retired in favor of the same unified resolver, but the AI-calling and message-array logic is fine to keep
- `src/lib/queue.ts` (`smartSend`) — currently WhatsApp-only; extend into a channel-dispatching outbound queue (Section 6)
- `campaigns` / `broadcast_campaigns` tables and `src/lib/campaigns.ts` — festival-message generation logic is channel-agnostic already (returns plain text), just needs a channel-aware sender
- `proposals`/`invoices`/`payments` tables — reuse directly for Reservation-linked billing; a reservation should be able to generate a proposal/invoice the same way a lead does today
- Dashboard/analytics query patterns in `src/app/api/dashboard/*` and `src/app/api/analytics/route.ts` — same aggregation approach, extended with reservation and conversation-channel breakdowns

**Do not reuse, replace:**
- Settings page's `localStorage` persistence — needs a real `settings`-backed API from scratch (the UI shell itself can largely stay)
- Website chat's inline dedup logic in `api/chat/route.ts` — superseded by the unified resolver

---

## 3. Required Database Changes

All additive — no destructive changes, no renames, no column removals. Every existing table keeps working exactly as it does today.

**New tables:** `customers` (or promote `leads` — see Section 8 for the recommended approach and why), `customer_identities`, `channels`, `unified_conversations`, `unified_messages`, `reservations`, `reservation_addons`, `room_types`, `meal_plans`, `rate_plans`/`seasonal_rates`, `settings` (key-value, replacing localStorage), `ai_prompts` (versioned prompt config), `knowledge_sources` (structured content feeding the AI, separate from raw `knowledge_chunks`).

**Extended (additive columns only) on existing tables:** `leads` gains `customer_id` (nullable FK, backfilled), `packages` gains nothing structural but starts being actually queried, `proposals`/`invoices` gain an optional `reservation_id` FK alongside the existing `lead_id` FK.

**No columns removed or renamed anywhere.** Full proposed schema is in Section 8.

---

## 4. Completed Remediation Work (context for this review)

Per `audit/COMPLETED_ISSUES.md` and `audit/CURRENT_STATUS.md`, prior sessions have already: added real session-based authentication (`requireAuth`/`requireRole` on ~28 routes), fixed a critical cookie-handling bug that was silently 401-ing every protected write (verified live), consolidated OAuth callback handling, added WhatsApp webhook HMAC signature verification, wired the escalation engine to a cron job, built a real Resend-backed email system (verified live end-to-end), and reconciled the live database schema against migration files (migration 009). This session additionally fixed a Kanban/Dashboard data-sync bug, added centralized env validation, added input validation to the highest-risk lead-management routes, and produced an audit checkpoint report.

**Relevance to this phase:** the codebase is more production-hardened than a fresh read might suggest — auth, email, and the core lead pipeline are solid foundations. The gaps that matter for this vision are specifically: no unified conversation layer, no reservation concept, no real settings/config backend, and AI content is hardcoded rather than data-driven. These are net-new capabilities, not fixes to existing broken things.

---

## 5. New Services and Adapters

```
src/services/
  conversation/
    unified-conversation-service.ts   -- get/create conversation by resolved customer identity
    identity-resolver.ts              -- multi-identifier customer matching (phone, email, social IDs)
    message-router.ts                 -- inbound message -> conversation -> AI or human queue
  channels/
    adapter.interface.ts              -- shared contract every channel adapter implements
    whatsapp-adapter.ts                -- wraps existing src/lib/whatsapp/* (mostly a rename/re-export)
    website-chat-adapter.ts            -- wraps existing api/chat logic
    facebook-messenger-adapter.ts      -- new
    instagram-dm-adapter.ts            -- new
    google-business-adapter.ts         -- new (subject to API availability)
    linkedin-adapter.ts                -- new, likely deferred (see Risks)
    email-adapter.ts                   -- wraps existing src/lib/email/*
  reservations/
    reservation-service.ts             -- CRUD + status transitions
    pricing-engine.ts                  -- rate resolution (base/seasonal/weekend/festival/corporate/override)
    availability-service.ts            -- room/date availability checks
  ai/
    orchestrator.ts                    -- replaces ad-hoc calls in api/chat/route.ts; single entry point all adapters call
    knowledge-service.ts               -- real vector retrieval using the existing match_knowledge_chunks() RPC, plus packages.ai_description
    handoff-service.ts                 -- confidence/escalation-rule evaluation, human routing
    suggestion-service.ts              -- reply suggestions, rewrite, tone, translation for human agents
  settings/
    settings-service.ts                -- typed read/write over the new settings table, replaces localStorage
```

**Adapter contract (conceptual, not final code):** every channel adapter implements `receiveMessage(rawPayload) -> NormalizedInboundMessage` and `sendMessage(NormalizedOutboundMessage) -> DeliveryResult`. The Unified Conversation Service only ever talks to this interface -- adding a channel means writing one adapter file, never touching the orchestrator, the AI layer, or the CRM.

---

## 6. Omnichannel Communication Design

**Customer identity resolution (the hardest real problem here):** today, identity resolution is single-key (`leads.phone` for WhatsApp, ad-hoc phone/email scan for website chat). A true omnichannel system needs a `customer_identities` table: `(customer_id, identity_type, identity_value)` with a unique constraint on `(identity_type, identity_value)`, where `identity_type` is `phone | email | facebook_psid | instagram_igsid | whatsapp_id | google_business_id | linkedin_id`. Resolution order on a new inbound message: (1) exact identity match -> existing customer; (2) fuzzy match on phone/email against `leads`/`customer_identities` -> attach new identity to existing customer, never create a duplicate; (3) no match -> new customer + new identity. This directly generalizes `resolveLeadByPhone()`'s existing logic -- same shape, more identity types.

**Conversation merging:** a `unified_conversations` table keyed by `customer_id` (not by channel), with a `unified_conversation_channels` junction table tracking which channels have touched this conversation and when. A customer who messages on WhatsApp, then later fills the website form, then later DMs on Instagram, is one conversation record with three channel touchpoints -- not three separate conversation rows the way `conversations` and `whatsapp_conversations` are today.

**Channel-specific realities that shape the design:**
- WhatsApp, Messenger, Instagram: webhook-push, near-real-time, message IDs for idempotency (already solved in `process-inbound.ts`)
- Website chat: request/response, no webhook, session-based -- needs the adapter to translate a synchronous chat call into the same async message-append shape
- Email: neither push nor pull in real time; needs either IMAP polling or a provider webhook (Resend supports inbound webhooks) -- recommend building this adapter last, after the pattern is proven on 2-3 push channels
- Google Business Profile messaging: API access requires Google Business Profile API approval, historically slow and restrictive -- treat as **at-risk**, not guaranteed
- LinkedIn Messaging: no general-purpose messaging API for business pages exists as of this review -- flagged as **high-risk / likely not implementable** without LinkedIn granting special partner access. Recommend explicitly deferring and validating API access before committing engineering time.

---

## 7. AI Orchestration Design

```
Inbound message (any channel, normalized)
        |
        v
  AI Orchestrator
        |
        +--> Knowledge Service --> match_knowledge_chunks() (real vector search,
        |                          currently unused) + packages.ai_description
        |                          + new knowledge_sources table
        |
        +--> Handoff Service ----> evaluate confidence score, keyword triggers
        |                          ("human", "refund", "complaint"), VIP flag
        |                          (leads.is_vip already exists), payment-related
        |                          intent -> decide AI-continues vs escalate
        |
        +--> (if continuing) generate reply via existing chatWithAI() pattern,
        |    now with dynamic knowledge context instead of hardcoded prompt
        |
        +--> Lead/Customer extraction (existing extractLeadFromTag/extractLeadViaAI
             logic, generalized to update `customers` not just `leads`)
```

**Confidence scoring:** Claude/OpenAI don't return a native "confidence" score for a chat completion. Recommend a composite heuristic score (not a single model call): knowledge-retrieval hit count/relevance, presence of hedging language in the model's own response, whether the user's message matches an escalation-keyword list, and conversation length without resolution. This avoids a second AI call just to score confidence (cost/latency), consistent with the existing lightweight approach (`chunkText`, keyword search) already in this codebase.

**AI-assisted human chat (suggested replies, rewrite, tone, translation):** these are all single-shot Claude calls with a small, task-specific prompt -- same pattern as `generateFestivalMessage()` in `src/lib/campaigns.ts` already uses. No new infrastructure needed beyond one new API route per capability, all behind `requireAuth()`.

**Editable AI knowledge without code changes:** two-part fix. (1) Start actually calling `match_knowledge_chunks()` in `retrieveRelevantKnowledge()` instead of `ilike` -- the vector index already exists. (2) Move `SYSTEM_PROMPT`'s static business facts (property details, contact numbers, policies) into the new `settings`/`ai_prompts` tables, composed at request time instead of hardcoded. Pricing specifically should be pulled live from `packages` (already has `ai_description`), not duplicated in a prompt string that will drift out of sync with real prices -- this is likely already happening today, since nothing keeps `SYSTEM_PROMPT`'s hardcoded figures in sync with whatever `packages.base_price` actually holds.

---

## 8. Database Schema Proposal

Additive only. Existing tables/columns are unchanged unless explicitly marked "new column."

```sql
-- Identity resolution
customer_identities (
  id, customer_id FK, identity_type TEXT, identity_value TEXT,
  verified BOOLEAN, created_at,
  UNIQUE(identity_type, identity_value)
)

-- Recommendation: `leads` becomes the customer record (add customer-lifecycle
-- fields it doesn't have yet) rather than introducing a parallel `customers`
-- table. `leads` already has 50+ columns covering scoring, VIP status,
-- lifetime_value, repeat_customer -- it is already closer to "customer" than
-- "sales lead." A separate `customers` table risks becoming a second
-- `leads`/`conversations`-style unsynced pair. If the business genuinely
-- needs to distinguish "not-yet-a-customer lead" from "confirmed customer,"
-- prefer a `leads.customer_status` enum over a second table. Flagging both
-- options for your decision -- this is the single highest-leverage schema
-- choice in this whole proposal.

-- Channels & unified conversation
channels ( id, channel_type TEXT, display_name, config JSONB, is_active )
unified_conversations (
  id, customer_id FK, status TEXT, assigned_to UUID, ai_active BOOLEAN,
  last_message_at, first_touch_channel_id FK, created_at
)
unified_conversation_channels (
  id, conversation_id FK, channel_id FK, channel_identity TEXT,
  first_seen_at, last_seen_at
)
unified_messages (
  id, conversation_id FK, channel_id FK, direction TEXT, sender_type TEXT
    CHECK (sender_type IN ('customer','ai','human')),
  content TEXT, raw_payload JSONB, external_message_id TEXT,
  ai_confidence NUMERIC, created_at
)

-- Reservations (new module, per the vision doc's explicit instruction not to
-- mix with leads or bookings)
room_types ( id, name, description, max_occupancy, base_capacity, is_active )
meal_plans ( id, code TEXT, name, description, price NUMERIC, is_active )
  -- Room Only / Breakfast / MAP / AP, admin-configurable per the vision doc
rate_plans (
  id, room_type_id FK, rate_type TEXT
    CHECK (rate_type IN ('base','seasonal','weekend','festival','corporate','promotional')),
  start_date, end_date, price NUMERIC, priority INTEGER, is_active
)
  -- priority resolves conflicts when multiple rate_plans overlap a date
addon_services ( id, name, price NUMERIC, is_active, category TEXT )
  -- Extra Bed, Airport Pickup/Drop, Early Check-in, Late Check-out,
  -- Decoration/Anniversary/Birthday packages -- all admin-configurable
reservations (
  id, customer_id FK (-> leads.id per the recommendation above),
  guest_name, guest_mobile, guest_email, guest_address, guest_id_proof,
  guest_nationality,
  check_in_date, check_out_date, nights INTEGER GENERATED,
  adults INTEGER, children INTEGER,
  room_type_id FK, room_count INTEGER,
  booking_source TEXT, status TEXT
    CHECK (status IN ('inquiry','tentative','confirmed','checked_in','checked_out','cancelled','no_show')),
  base_room_rate NUMERIC, discount_amount NUMERIC, final_room_rate NUMERIC,
  meal_plan_id FK, meal_plan_charge NUMERIC,
  proposal_id FK (nullable, -> existing proposals table),
  invoice_id FK (nullable, -> existing invoices table),
  created_at, updated_at
)
reservation_addons ( id, reservation_id FK, addon_service_id FK, quantity, unit_price, total_price )

-- Settings & AI configuration
settings ( id, category TEXT, key TEXT, value JSONB, updated_by, updated_at, UNIQUE(category, key) )
ai_prompts ( id, name, prompt_template TEXT, version INTEGER, is_active, created_at )
knowledge_sources ( id, category TEXT, title, content TEXT, embedding VECTOR(1536), is_active, updated_at )
  -- feeds match_knowledge_chunks()-style retrieval; knowledge_chunks table
  -- stays as-is for document-derived content, this is for structured/curated entries

-- AI analytics
ai_interaction_log ( id, conversation_id FK, confidence_score, escalated BOOLEAN, escalation_reason, response_time_ms, created_at )
```

**Reused as-is:** `leads`, `proposals`, `invoices`, `payments`, `packages`, `activity_logs`, `campaigns`/`broadcast_campaigns`, `follow_ups`, `escalations`, `email_log`, `user_profiles`.

**Recommendation to consolidate, not expand:** `activity_logs`, `activity_events`, and `analytics_events` currently overlap. Rather than adding a 4th logging table for the new modules, extend `activity_logs` (the one already used everywhere) with an optional `channel_type`/`entity_type` column pair and route new event types through it. This is a design recommendation, not a required change -- flagging it because the temptation in this expansion will be to add yet another events table.

---

## 9. API Design

New routes, following the existing `requireAuth()` + zod `parseBody()` pattern established this session:

```
POST   /api/conversations/inbound/:channel      -- adapter webhook entry points (per-channel auth: HMAC for WA/Meta, provider-specific for others)
GET    /api/conversations                        -- unified inbox list, filterable by status/channel/assigned_to
GET    /api/conversations/:id                     -- full merged history across channels
POST   /api/conversations/:id/reply               -- human sends a message (any channel, routed by the service)
POST   /api/conversations/:id/handoff              -- toggle AI/human control
POST   /api/conversations/:id/suggest              -- AI-assisted reply suggestion (not sent, just suggested)

GET    /api/reservations                          -- list/filter (upcoming check-ins, today's arrivals, etc.)
POST   /api/reservations                          -- create
GET    /api/reservations/:id
PATCH  /api/reservations/:id                       -- strict allow-list, same mass-assignment protection pattern as this session's leads fix
POST   /api/reservations/:id/status                -- validated status transition, mirrors lead-stage-manager.ts pattern
GET    /api/reservations/availability              -- room/date availability check
POST   /api/reservations/:id/quote                 -- generate reservation quote (reuses proposal-pdf.ts pattern)

GET    /api/settings/:category                    -- read
PATCH  /api/settings/:category                     -- write, requireRole(['admin'])
GET    /api/ai/prompts
PATCH  /api/ai/prompts/:id

GET    /api/dashboard/conversations                -- active/closed/AI-handled/human-handled/escalated counts
GET    /api/dashboard/reservations                 -- occupancy, ADR, revenue, booking source, conversion
GET    /api/dashboard/ai-analytics                 -- confidence, escalation %, avg response time, CSAT
```

**Breaking-change discipline:** every new route is additive; no existing route path changes. Where a new route logically replaces old behavior (e.g., `/api/conversations/inbound/whatsapp` eventually superseding direct calls into `process-inbound.ts` from the webhook route), the old route keeps working during a transition window -- see Section 14.

---

## 10. UI/UX Wireframe Recommendations

- **Unified Inbox** (new top-level nav item, alongside existing Dashboard/WhatsApp/Proposals/Campaigns/Kanban/Settings): conversation list on the left (channel icon badge, customer name, last message preview, AI/Human/Escalated status pill), full thread on the right showing all channels interleaved chronologically with a channel-source tag per message, composer at the bottom with an AI-suggestion strip above it.
- **Reservation Calendar/List view**, similar visual language to the existing Kanban board -- a calendar view for check-in/check-out density is more useful here than a kanban-by-status view, but a status-based board (Inquiry -> Tentative -> Confirmed -> Checked-in -> Checked-out) can reuse the exact drag-and-drop pattern just rebuilt for Kanban this session, including its validated-transition-with-rejection-toast behavior.
- **Reservation detail panel**: guest details, date range picker, room type + meal plan selectors (dropdowns sourced from the new `room_types`/`meal_plans` tables), line-itemized pricing breakdown (room rate -> discount -> meal plan -> add-ons -> total), matching the example format in the vision doc.
- **Settings**: keep the existing page's visual structure (it's reasonably designed), but every section needs to actually call `/api/settings/:category` instead of `localStorage`, with per-section save state and validation errors surfaced inline.
- **AI Analytics dashboard**: reuse the existing `StatCard`/`PipelineCard` component patterns from `HotLeadDashboard.tsx` -- same visual language, new data source.

No new design system needed -- the existing Tailwind + `lucide-react` + `recharts` stack covers everything described here.

---

## 11. Implementation Phases

| Phase | Scope | Depends on |
|---|---|---|
| **0** | Settings backend (real `settings` table + API) -- unblocks everything else that needs to be "configurable without code changes" | Nothing |
| **1** | Identity resolution + `unified_conversations`/`unified_messages` schema, migrate WhatsApp adapter onto it (highest-traffic channel first, proves the pattern) | Phase 0 |
| **2** | Website chat adapter onto the same unified schema; retire `conversations` table's bespoke dedup logic | Phase 1 |
| **3** | AI Orchestrator + real vector knowledge retrieval + `packages`-driven pricing (replaces hardcoded `SYSTEM_PROMPT` figures) | Phase 1 |
| **4** | Human handoff + AI-assisted human chat (suggestions, rewrite, tone) | Phase 3 |
| **5** | Reservation module (schema, service, API, UI) -- independent of omnichannel work, can run in parallel with Phases 1-4 | Phase 0 |
| **6** | Reservation <-> Proposal/Invoice integration, pricing engine (seasonal/weekend/festival rates) | Phase 5 |
| **7** | New channel adapters: Facebook Messenger, Instagram DM (both use the same Meta Graph API family as existing WhatsApp code -- lowest incremental effort) | Phase 2 |
| **8** | Email channel adapter (inbound) | Phase 2 |
| **9** | Google Business Profile adapter -- **contingent on API access approval**, validate before committing the phase | Phase 2 |
| **10** | Dashboards (conversations, reservations, AI analytics) | Phases 3-6 |
| **11** | LinkedIn adapter -- **deferred pending API availability confirmation**, may not proceed | -- |

Each phase closes with: `tsc --noEmit`, `next lint`, `vitest run`, a full `npm run build`, and -- critically, given this session's repeated finding that static checks alone miss real bugs -- a live click-through test before moving to the next phase.

---

## 12. Estimated Effort

Rough sizing only, in developer-days of focused work (not calendar time, and not adjusted for AI-assisted development speed, which varies enormously by how much back-and-forth verification each phase needs):

| Phase | Estimate |
|---|---|
| 0 -- Settings backend | 2-3 days |
| 1 -- Identity resolution + unified schema + WhatsApp migration | 5-7 days |
| 2 -- Website chat migration | 3-4 days |
| 3 -- AI orchestrator + real vector retrieval + dynamic pricing | 4-6 days |
| 4 -- Human handoff + AI-assisted chat | 4-5 days |
| 5 -- Reservation module (schema + service + API + UI) | 8-10 days |
| 6 -- Reservation <-> Proposal/Invoice + pricing engine | 4-6 days |
| 7 -- Facebook + Instagram adapters | 3-4 days |
| 8 -- Email adapter | 3-4 days |
| 9 -- Google Business adapter | 2-4 days (excluding API-approval wait time, which is outside engineering control) |
| 10 -- Dashboards | 4-5 days |
| 11 -- LinkedIn adapter | Unestimated -- blocked on API access confirmation |

**Total (excluding LinkedIn, excluding API-approval wait times): roughly 42-58 developer-days.** This is a multi-month effort at any realistic pace, not a single-session build -- flagging this explicitly since the original request framed this as something to plan now and "instruct to continue" after approval; the honest scope here is a program of work, not a feature.

---

## 13. Risks and Mitigation

| Risk | Severity | Mitigation |
|---|---|---|
| LinkedIn has no general messaging API for business accounts | High (likely blocks Phase 11 entirely) | Validate access before any engineering investment; treat as optional/deferred in all planning |
| Google Business Profile messaging API access is restrictive/slow to obtain | Medium | Apply for access early, in parallel with Phase 0-2 work, not on the Phase 9 critical path |
| `leads` vs new `customers` table decision (Section 8) creates a third unsynced identity table if decided wrong | High | This session already found and fixed one two-table-desync bug (Kanban/Dashboard); explicitly decide this before Phase 1 starts, don't let it get implicitly decided by whoever writes the first migration |
| Same file-truncation tooling bug that hit this session repeatedly on large files | Medium (execution risk, not design risk) | Any implementation session should write new large files via the heredoc-to-tempfile-then-copy pattern established this session, verified with `wc -c`/`tail -c`, not trust the edit tool's own success message |
| No live testing capability confirmed in the sandbox that would implement this | High (verification risk) | Every phase needs a live click-through pass by someone with real browser + Supabase access before being called done -- static checks alone already proven insufficient on this exact codebase (the missing sign-out button, the Kanban/status bug) |
| No `.git` repository currently exists in this working copy | ~~Critical~~ **RESOLVED 2026-07-13** | Root cause found: `.git/HEAD` had 3 trailing null bytes (matches this file's own "file-truncation tooling bug" note above -- same class of bug, different file) and the index contained 25 bogus null-SHA entries plus 25 files falsely staged as deleted (all confirmed byte-identical to `HEAD` on inspection -- no actual data loss). Repaired via `git symbolic-ref` + `git read-tree HEAD` on an isolated `/tmp` copy of `.git` (this mount does not support the atomic exclusive-create git needs for its lockfile -- confirmed reproducible even on a fresh, uncorrupted `.git` dir -- so all future git *writes* on this repo must go through a `/tmp`-based `GIT_DIR` and be synced back; reads work fine directly). Repo now resolves cleanly: `feature/v3-omnichannel-platform` at `fed963e`, all branches/tags intact. **New critical finding surfaced during this repair, see next row.** |
| **NEW 2026-07-13:** Customer PII (real name, unmasked phone number, message content) is live in git history reachable from `main`, at commit `43b6a15` -- and that commit **is already pushed to `origin`** (`github.com/raju1605jobs-hash/bookmyspaces-crm-v2.git`) | **Critical** | This file's Section 4 / `CURRENT_STATUS.md` describe a `git-filter-repo` history rewrite that was supposedly already done to strip this exact PII, with two backup bundles saved to a *different* prior session's own temporary output storage (not this repo, not recoverable from here). That rewrite is **not present in the git history this session found** -- current `main`/`fed963e` still contain the original, unredacted blobs (verified by blob size, not by reading the PII itself). Not fixed autonomously here: rewriting already-pushed history is explicitly a hold-for-review action (affects any existing clone/collaborator, needs the user's own GitHub credentials to force-push). **Needs the user's direct decision and action -- see Morning Handover Report.** |
| Real-time push channels (WhatsApp/FB/IG) vs pull-based email create inconsistent latency in the "unified" inbox | Low-Medium | Design the UI to show per-message delivery/read status rather than assuming uniform real-time behavior across channels |
| AI confidence scoring has no native model support (Section 7) | Medium | Composite heuristic approach, explicitly not a hard science -- plan to tune thresholds against real escalation data after Phase 4 ships, not assume correctness upfront |
| Existing hardcoded pricing in `SYSTEM_PROMPT` may already be stale vs. live `packages.base_price` | Medium (pre-existing, discovered by this review) | Worth checking before Phase 3 even starts -- quick, independent fix |

---

## 14. Migration Strategy

**Additive-first, dual-write during transition, no big-bang cutover.**

1. New tables ship alongside old ones; nothing is dropped or renamed at any point in this plan.
2. New channel adapters write to the new unified schema. The existing WhatsApp/website-chat paths keep writing to their current tables *during* the transition, with a background job backfilling `customer_identities`/`unified_conversations` from existing `leads`/`conversations`/`whatsapp_conversations` data -- read paths (Unified Inbox UI) can then read from the new schema once backfill is confirmed complete, while old dashboards keep working off old tables until they're individually migrated.
3. Each old-table-reading feature (Dashboard, Kanban, existing WhatsApp campaign tools) migrates to the new schema one at a time, verified working, before the next one starts -- never a simultaneous cutover of multiple features.
4. Old tables are never deleted in this plan. If fully retired later, that's a separate, explicit future decision -- consistent with how this codebase already treats schema changes (every migration reviewed this session was additive-only, confirmed safe against live production before running).
5. Rollback at any phase boundary = stop writing to new tables, keep reading old ones; since nothing old was ever dropped, this is a low-risk stopping point at every phase.

---

## 15. Final Architecture Diagram

```
+------------------------------------------------------------------------+
|  Channels                                                               |
|  Website Chat . WhatsApp . Facebook . Instagram . Google Business .     |
|  LinkedIn (deferred) . Email                                            |
+---------------------------------+---------------------------------------+
                                   |
+----------------------------------v--------------------------------------+
|  Adapter Layer  (src/services/channels/*)                               |
|  One file per channel, shared interface: receiveMessage / sendMessage   |
|  New channel = new adapter file only -- nothing else changes            |
+----------------------------------+---------------------------------------+
                                   |
+----------------------------------v--------------------------------------+
|  Unified Conversation Service  (src/services/conversation/*)            |
|  Identity Resolver -> get/create unified_conversation -> log message    |
+----------------------------------+---------------------------------------+
                                   |
+-----------------+----------------+----------------+----------------------+
|                  |                |                |                      |
v                  v                v                v                      v
Customer         Reservation     Proposal         AI Orchestrator       Settings
Service          Service         Service          (existing, extended   Service
(leads, ext.)    (new)           (existing)        to also serve chat)  (new)
|                  |                |                |                      |
+---------+--------+-------+--------+--------+-------+-----------+----------+
          |                |                 |                   |
          v                v                 v                   v
+---------------------------------------------------------------------------+
|  Supabase / Postgres                                                      |
|  Existing: leads, proposals, invoices, payments, packages,                |
|  activity_logs, campaigns, follow_ups, user_profiles                      |
|  New: customer_identities, unified_conversations, unified_messages,       |
|  reservations, room_types, meal_plans, rate_plans, addon_services,        |
|  settings, ai_prompts, knowledge_sources, ai_interaction_log              |
+---------------------------------------------------------------------------+
```

---

## Open Decisions Needed Before Implementation Starts

1. ~~**`leads` extended vs. new `customers` table**~~ -- **RESOLVED 2026-07-13 (Product Owner).** Confirmed: extend `leads`, no new `customers` table. Migration 012's FKs already implemented this as the default; now locked in as final. See `supabase/migrations/012_v3_foundation_schema.sql` header.
2. ~~**Git repository status**~~ -- **RESOLVED 2026-07-13**, see Section 13 risk table. PII-in-pushed-history finding (commit `43b6a15`) surfaced during the repair -- **remediation plan confirmed 2026-07-13 (Product Owner): contain (repo private) + rotate token + purge history.** See `audit/PII_REMEDIATION_PLAN.md` for exact steps (execution requires GitHub credentials not available in-sandbox).
3. **LinkedIn and Google Business Profile API access** -- confirm feasibility before these phases are scheduled, not after.
4. **`activity_logs`/`activity_events`/`analytics_events` consolidation** (Section 8) -- recommend consolidating rather than adding a 4th table, but flagging as a decision point, not assuming.
5. **Phasing order** -- Section 11's order (Settings -> Unified Conversations on WhatsApp first -> AI Orchestrator -> Reservations in parallel) is a recommen