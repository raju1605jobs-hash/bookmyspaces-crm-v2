# Migration 012 / 013 — Deployment Validation Guide

**Status as of Sprint 4:** migrations 012 and 013 are reviewed, unit-tested against schema-shaped mocks, and packaged for one-command deployment — but still **not applied** to the live database. This engineering sandbox has no network route to Supabase (`nssteddtqgqubggpcwae.supabase.co` fails DNS resolution here, and a direct HTTPS request is rejected by the sandbox's egress proxy — re-confirmed this session, not assumed from prior ones). Only Raju, from a machine with real access to the Supabase project, can complete this.

This document is the checklist to actually close that gap.

## 1. Before you run anything

- Take a backup / snapshot first if you have any doubt. Both migrations are additive-only (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) and touch no existing table's existing columns, but "additive" isn't the same as "risk-free" — a backup costs a few minutes.
- Get your Postgres connection string: **Supabase Dashboard → Project Settings → Database → Connection string → URI**. Either the direct connection or the session pooler string works for this one-off use.
- You'll need `DATABASE_URL` set for every command below.

## 2. Apply the migrations

```bash
cd bookmyspaces
npm install                     # picks up the `pg` devDependency if you haven't already
DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:migrate:v3
```

This runs `012_v3_foundation_schema.sql` then `013_proposal_reservation_links.sql`, in that order (013 depends on 012's tables). Expected output ends with:

```
Verifying...
  properties: 2, inventory_items: 0, reservations: 0

✅ Migrations 012 and 013 applied successfully.
```

`properties: 2` is the two seeded rows (Skyline Serenity, Monurama Homestay). `inventory_items: 0` and `reservations: 0` are expected — no rooms/rate plans are seeded yet (see step 5).

If this fails partway through, both migration files are idempotent (`IF NOT EXISTS` everywhere) — fix whatever the error points to and re-run the same command; it will skip everything already created.

## 3. Run the smoke test

```bash
DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:smoke-test:v3
```

This is new this sprint (`scripts/smoke-test-v3.mjs`). It checks, in order:

1. All 16 migration-012 tables exist.
2. All 5 migration-013 columns exist on `proposals`.
3. The 4 foreign keys the app's services actually depend on are enforced (`reservations.property_id → properties`, `reservations.inventory_item_id → inventory_items`, `reservations.proposal_id → proposals`, `proposals.reservation_id → reservations`).
4. The indexes `availability-service.ts` and the reservation-list queries rely on exist (`idx_reservations_dates`, `idx_reservations_status`, `idx_reservations_inventory_item_id`, `idx_knowledge_sources_embedding`).
5. Row Level Security is enabled with a `service_role`-only policy on every new table.
6. Both seed properties are present.
7. **A functional test**, not just a schema check: it inserts a throwaway inventory item, rate plan, and reservation (2026-09-10 → 2026-09-14), then runs `availability-service.ts`'s exact overlap query and confirms it correctly flags a conflict for an overlapping request (2026-09-12 → 2026-09-16) and correctly reports no conflict for a genuinely free range (2026-10-01 → 2026-10-03). It also confirms the `nights` generated column computes correctly. Everything in step 7 runs inside one transaction that is **always rolled back** — nothing it inserts is left in the database, win or lose.

Expected output ends with:

```
✅ All N checks passed. Migrations 012/013 are structurally sound and functionally correct.
```

If anything fails, the script prints exactly which check(s) failed — that's the specific thing to investigate, not a reason to re-run the whole migration blind.

**Note on a schema fix made this sprint:** while tracing the full enquiry-to-timeline workflow in code (no live database needed for this part), `ai_interaction_log`'s original column list didn't match what `timeline-service.ts` has queried against it since Day 4 (`lead_id`, `interaction_type`, `summary` were missing — only `conversation_id` existed). That would have compiled and passed every mocked test, then silently degraded the "AI interaction" timeline entry forever once this migration went live, with no visible error. Fixed directly in `012_v3_foundation_schema.sql` since it was still pre-application — if you already have an OLDER copy of this repo's migration 012 applied somewhere, you'll need `ALTER TABLE ai_interaction_log ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE, ADD COLUMN IF NOT EXISTS interaction_type TEXT, ADD COLUMN IF NOT EXISTS summary TEXT;` to catch up — but if you're applying it for the first time via `db:migrate:v3`, this is already baked in and there's nothing extra to do.

## 4. Manual app-level verification

Once the smoke test passes, restart the app (or redeploy) and check, in order:

1. **Reservation Dashboard** (`/reservations`) — should load with all-zero stats and an empty "Room / Hall" picker in the New Reservation modal. That's expected at this point (no inventory yet) — it should NOT show any error banner about migration 012.
2. **Customers page** (`/customers`) — search for any existing lead by name/phone; this doesn't depend on migration 012 at all, so it should already work today, migration or not. If it doesn't, that's a regression unrelated to this migration.
3. Add at least one real `inventory_items` row (and a `rate_plans` row for it) for each property, either through Supabase's table editor or SQL, so the Reservation Dashboard has something bookable. There is no admin UI for this yet — it's raw SQL/table-editor work for now.
4. With real inventory in place: create a test reservation through the Reservation Dashboard, check availability, confirm it, generate a proposal from it (Reservation Details → "Generate proposal from this reservation"), then convert a different proposal into a reservation (Proposals page → "Convert to Reservation") to confirm both directions of the proposal↔reservation link work against real data.
5. Generate an invoice for that proposal (Proposals page → Financial Documents → Latest Invoice) — this doesn't depend on migration 012 either (the `invoices` table has been live since migration 009), but it's the natural next step in the same test pass.

## 5. Rollback (if needed)

```bash
DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:rollback:v3
```

Runs `013_proposal_reservation_links_ROLLBACK.sql` then `012_v3_foundation_schema_ROLLBACK.sql`, in that order (undo 013's additions before dropping the 012 tables they reference). **This permanently deletes any reservations/properties/inventory data created after the migration** — read the warning the script prints before confirming, and take a fresh backup first if any real bookings have been created in the meantime.

## 6. What "done" looks like

Migration 012/013 activation is complete when: `db:migrate:v3` has run successfully once, `db:smoke-test:v3` reports all checks passed, and at least one real reservation → proposal → invoice loop has been exercised through the app against real data (step 4 above). At that point the "Fix integration issues immediately" instruction in the Sprint 4 protocol can actually be acted on with real failures instead of theoretical ones — until then, every reservation-platform code path in this app is exercising the same code that has been reviewed and mock-tested for four sessions, but never run against Postgres.
