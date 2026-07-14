# BookMySpaces V3 — Version 1.1 Roadmap

Planning only — nothing in this document is implemented. Prioritized by a rough cost/value read from release-preparation work across this project's sessions, not a committed schedule; Raju sets actual priority and timing.

## Tier 1 — High Value, Relatively Low Effort (do these first)

1. **Admin UI for inventory/rate plans.** Currently there is no in-app way to add properties/rooms/rate plans/meal plans/add-ons — it's raw Supabase Table Editor or SQL (see `ADMIN_MANUAL.md`). A simple CRUD screen would remove the single biggest day-to-day friction point for actually using the Reservation Platform.
2. **A real refund workflow.** Today a refund is a negative `payments` row by convention (see `FINANCE_USER_GUIDE.md`) — works, but error-prone and has no dedicated audit trail. A `payment_type` CHECK constraint including `'refund'` plus a small UI affordance (a "Refund" button instead of typing a negative number) would close this cleanly.
3. **Error tracking / APM.** No Sentry-equivalent is wired in — `DEPLOYMENT_RUNBOOK.md` flags this as the current monitoring gap. Highest safety-per-effort item on this list for a system now handling real payments.
4. **Dedicated `admin_audit_log` table.** RC1 found and fixed an admin-actions audit-logging gap with structured application logs; a real queryable table (recommended then, still not done) is a small, well-scoped migration.
5. **API rate limiting.** No general rate limiting exists on public routes (`/api/chat`, `/api/proposals/[id]/preview`, the WhatsApp webhook) beyond the WhatsApp-specific in-app throttle in `src/lib/queue.ts`. Worth adding at the edge (Vercel/Upstash) before traffic grows.

## Tier 2 — OTA Integration

6. **Booking.com Connectivity API** — highest-traffic OTA for most Indian hospitality businesses; start here.
7. **Agoda YCS/API** — similar shape to Booking.com, second priority.
8. **Google Hotels / Google Business Profile booking links** — lower integration effort than a full OTA channel manager, meaningful visibility gain.
9. **Expedia Rapid API** — lower priority unless there's a specific existing Expedia relationship.
10. **Airbnb API** — Airbnb's public API access is more restricted (partner-tier requirements); scope this last and validate access eligibility before committing engineering time.

All five need a channel-manager layer (mapping OTA rate/availability calendars onto `rate_plans`/`inventory_items`) — a real architectural addition, not a quick integration; sequence after Tier 1.

## Tier 3 — Operations Depth

11. **Housekeeping module** — room status (clean/dirty/inspected/out-of-service) tied to `reservations.status` transitions (a `checked_out` reservation should trigger a housekeeping task).
12. **Maintenance tracking** — issue logging per inventory item, separate from housekeeping's turnover cadence.
13. **Inventory/stock management** — consumables (toiletries, linens, minibar), a genuinely separate domain from room inventory.
14. **Accounting integration** — export to Tally/Zoho Books/QuickBooks (whichever Raju's accountant already uses) rather than building bookkeeping in-house; scope as an export/sync feature, not a general ledger.

## Tier 4 — Reach & Insight

15. **Mobile app** — a wrapped/native app for staff (reception/sales on the go) and/or guests (self-service booking). Significant effort; validate demand via actual mobile-web usage patterns first before committing to native.
16. **Analytics beyond the two existing dashboards** — cohort analysis (repeat-guest rate over time), channel-attribution reporting, staff performance trends (`staff_performance` table already exists from migration 004, currently unused by any code — natural first analytics feature to build against it).
17. **AI enhancements** — automated daily summaries (`ai_summaries`/`notification_settings` tables already exist from migration 004 but are currently dead code, per `ai-summary.ts`'s confirmed-unreachable status — this is a "finish what's already drafted" item, not new scope), proactive lead-scoring alerts, AI-assisted pricing suggestions.

## Explicitly Not Prioritized (revisit only if a real need surfaces)

- Multi-language support — no signal this is needed yet for a single-market Kolkata business.
- White-labeling / multi-tenant support — this is a single-business system by design; don't build multi-tenancy speculatively.

## How to Use This Roadmap

Re-evaluate priority order against actual usage data once V1 has real production traffic — several items here (analytics depth, mobile) are genuinely better prioritized by what guests/staff actually struggle with post-launch than by guessing now. Tier 1 items are the exception: they're operational-safety and day-to-day-usability items worth doing regardless of usage patterns.
