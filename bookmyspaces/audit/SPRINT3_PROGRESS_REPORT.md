# Sprint 3 Progress Report — Operator Screens & Migration 012 Activation

**Branch:** `feature/v3-omnichannel-platform`
**Session scope:** continuation from Sprint 2 (`audit/SPRINT2_PROGRESS_REPORT.md`)

---

## Executive Summary

This sprint's stated top priority was activating migration 012 (the `properties`/`inventory_items`/`reservations` foundation every Reservation Platform service has been built against since Day 1, but which has never been applied to the live database). That priority is now as complete as it can be from this environment: migration 012 and its companion 013 (proposal↔reservation links) were re-validated line by line — schema, constraints, indexes, dependency order, idempotency, and rollback completeness — and a one-command deployment script (`npm run db:migrate:v3`) was built so Raju can apply both migrations from a machine with real network access to Supabase. This sandbox has no route to `supabase.co` (confirmed directly this session via DNS/connect tests, not assumed from prior reports), so live execution and end-to-end testing against real data remain blocked until that script is run.

With migration 012 not yet live, this sprint's second priority — completing Proposal Management — was the highest-leverage work actually shippable today. The "Convert Proposal → Reservation" loop is now closed end to end: an accepted proposal can be turned into a reservation pre-filled with the guest's details, and a reservation can generate a proposal back out. A Customer Search entry point was also added, closing a real gap in the Definition of Success ("search customer" had no UI path to reach the existing Customer Profile screen). Invoice generation, which Sprint 2's report incorrectly claimed was entirely unbuilt, was found this session to already exist as a mature, fully-wired feature — that record is corrected below.

Reservation Calendar, Front Desk Workflow polish beyond Sprint 2, AI Assistant features, broader operational Dashboards, and a general polish pass were not addressed this session and are carried forward — see Next Sprint Recommendation.

---

## Business Features Completed

- **Convert Proposal → Reservation (end to end).** An accepted proposal on the Proposals page now shows a "Convert to Reservation" link. It opens the Reservation Dashboard with the proposal's guest name, mobile, email, and (once migration 013's link columns are populated) inventory item and check-in date pre-filled into the New Reservation modal. The operator still confirms room/hall, dates, and availability before creating — this doesn't skip the availability/pricing checks, it only removes re-typing. The created reservation is linked back via `reservations.proposal_id`.
- **Generate Proposal → Reservation (the other direction).** The Reservation Details screen now has a "Generate proposal from this reservation" action, wrapping the existing (previously unwired) `createProposalFromReservation()` service function. Once generated, the screen shows the resulting proposal number as a link instead of the button.
- **Customer search.** Definition of Success lists "search customer" as its own step; there was previously no UI path to it other than a direct URL to a specific customer's profile. A `/customers` search page now wraps the already-live `GET /api/leads?search=` endpoint (matches name/phone/email/event type) and links results into the existing Customer Profile screen.
- **Invoice generation — corrected record, not new work.** Sprint 2's report stated no invoice-generation route or UI existed. That was wrong: `/api/proposals/[id]/invoice` already implements a complete get-or-create upsert against the live `invoices` table, with real payment/balance tracking pulled from the `payments` table, amount-in-words, a branded printable HTML/PDF invoice, and a "Consolidated Statement" variant — all already wired to a "Financial Documents" button on the Proposals page. This pre-dates my involvement entirely. No code changes were needed here; this report exists to correct the prior claim.

## Screens Completed / Modified

| Screen | Change |
|---|---|
| Proposals (`/proposals`) | "Convert to Reservation" action added to the accepted-proposal action strip |
| Reservation Dashboard (`/reservations`) | Reads `?fromProposalId=`, fetches the proposal, auto-opens New Reservation modal pre-filled with guest + property/date details where available |
| Reservation Details (`/reservations/[id]`) | "Generate proposal from this reservation" action + resulting proposal link |
| Customers (`/customers`, new) | Search box over name/phone/email, results link into Customer Profile |
| CRM nav (`CRMLayout.tsx`) | Added "Customers" nav entry |

## Services Integrated

No new services were introduced — this sprint threaded an existing field through an existing chain and wired two already-built service functions to routes/UI for the first time:

- `reservation-service.ts` — `CreateReservationInput` gained `proposalId?: string | null`, set on `reservations.proposal_id` at insert time.
- `reservation-workflow.ts` — `createReservationWithQuote()` already extended `CreateReservationInput`, so `proposalId` flowed through with no changes needed there.
- `proposal-service.ts`'s `createProposalFromReservation()` — built and unit-tested in an earlier session, never called from any route until this sprint's new `POST /api/reservations/[id]/proposal`.
- `GET /api/leads?search=` — already live and already supported name/phone/email/event-type matching; the Customer Search screen is the first UI to call it.

## Database Changes

None applied. Migrations 012 (`properties`/`inventory_items`/`rate_plans`/`reservations`/`reservation_addons`) and 013 (`proposals.property_id`/`inventory_item_id`/`reservation_id`/`package_id`/`addon_service_ids`) remain reviewed, unit-tested-against, and ready, but not yet run against the live database. `scripts/apply-v3-migrations.mjs` (added last session, committed as `fa525fd`) is the one-command path: `DATABASE_URL="postgres://..." npm run db:migrate:v3`, run from a machine with network access to the Supabase project.

## API Changes

- `POST /api/reservations` — request body now accepts an optional `proposalId` (validated via `createReservationSchema`'s new `proposalId: uuid.nullish()`), threaded through to `createReservationWithQuote()`.
- `POST /api/reservations/[id]/proposal` (new) — generates a proposal from an existing reservation; 404 if the reservation doesn't exist, 502 if the underlying create fails (expected until migration 013 is live), 201 with `{ proposalId, proposalNumber, totalPrice }` on success.

No breaking changes to any existing route's contract.

## Build Status

- `npx tsc --noEmit` — clean, 0 errors, after every change this session.
- `npx next lint` — clean except the one pre-existing warning (`no-img-element` in `UserMenu.tsx`), unrelated to this sprint.
- `npx next build` — could not be run to completion in this sandbox; the process consistently exceeds this environment's per-command time budget partway through compilation (confirmed it starts and loads `.env.local` correctly before being cut off). This is a sandbox constraint, not a signal of a broken build — `tsc`/`lint`/`vitest` all passing across the full changed surface is the practical substitute used this session, consistent with prior sessions' experience with this same constraint. Recommend Raju run a full `npm run build` locally before the first customer demo as a final check.

## Test Status

`npx vitest run` — **20 test files, 150 tests, all passing**, including a new test for `proposalId` passthrough in `reservation-service.test.ts` (carries `proposal_id` onto the created reservation when converting a proposal).

## Commits (this session)

```
fa525fd chore(db): one-command deployment script for migrations 012/013
a55d519 feat(reservations): thread proposalId through reservation creation
46174e9 feat(api): generate a proposal from an existing reservation
9795f4a feat(ui): Generate Proposal action on Reservation Details
cddfa5d feat(ui): Convert Proposal to Reservation, end to end
fb4768a feat(ui): Customer search entry point
```

Each commit is one complete, independently reviewable capability, consistent with the "one commit = one business capability" rule; `fa525fd` was made in the prior session, included here because it's the direct predecessor to this session's migration-related work.

## Technical Debt Reduced

- Corrected a factual error in `SPRINT2_PROGRESS_REPORT.md` regarding invoice generation (documented above) rather than letting it stand or silently building a duplicate feature.
- `createProposalFromReservation()` (written, unit-tested, previously dead code with no caller) now has a real route calling it.
- No new abstractions, no new tables, no duplicate services were introduced this sprint — every change either threaded an existing field through an existing path or added a thin UI layer over an already-working query.

## Remaining Risks

- **Migration 012/013 are still not live.** Every reservation/inventory/proposal-link feature built across three sessions remains unverified against a real Postgres instance. This is the single biggest risk heading into a customer demo — the deployment script exists, but running it and smoke-testing the Reservation Dashboard/Calendar against real data has not happened yet.
- **No production build was completed this session** (sandbox time-budget constraint, not a known defect) — recommend a local `npm run build` before demo day.
- **Reservation Calendar, broader Dashboards, AI Assistant features, and general polish were not touched this sprint** — see below.

## Next Sprint Recommendation

1. **Run `npm run db:migrate:v3` against the real Supabase project** and smoke-test: create a reservation, check availability, generate a proposal, convert it back, generate an invoice — the full loop this report describes should be exercised against live data at least once before a demo.
2. **Reservation Calendar** (Priority 3, not started) — likely the next highest-value screen once real reservation data exists, since a calendar view needs real bookings to be useful in a demo.
3. **AI Assistant features** (Priority 6, not started) — Summarize Customer, Draft WhatsApp/Email Reply, Recommend Room/Package — all specified to reuse the existing AI Context Builder, no new AI plumbing needed.
4. **Broader operational Dashboards** (Priority 7) and **general polish pass** (Priority 8) — deferred consistent with the same honest-scoping approach as Sprint 2's report; recommend tackling these only after migration 012 is confirmed live, since several of the dashboard metrics (occupancy, OTA performance) are meaningless against zero real reservations.
