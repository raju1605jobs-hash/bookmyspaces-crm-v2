# BookMySpaces V3 — Database Validation

Confirms ordering, dependencies, rollback, idempotency, foreign keys, indexes, and RLS for the three migrations relevant to this launch (012, 013, 004), and produces the execution order. None of these three have been applied to the live database as of this review (C1/H1, `PRODUCTION_READINESS_REVIEW.md`) — this document is a pre-flight check, not a post-application report.

## Migration Execution Order

```
1. 012_v3_foundation_schema.sql
2. 013_proposal_reservation_links.sql
3. 004_phase4_campaigns.sql            (only if Campaigns is in scope for this launch — H1)
```

**012 before 013:** 013 adds foreign keys (`proposals.reservation_id`, `proposals.property_id`, `proposals.inventory_item_id`) into tables 012 creates — will fail if run first. `scripts/apply-v3-migrations.mjs` already enforces this order in code.

**004 is independent of 012/013** — it touches `leads` (additive columns) and creates its own standalone tables (`broadcast_campaigns`, `ai_summaries`, `festival_calendar`, `staff_performance`, `notification_settings`), none of which reference or are referenced by anything in 012/013. It can run before, after, or not at all, without affecting 012/013's correctness — the only reason to sequence it at all is the Campaigns-scope decision (H1), not a technical dependency.

## Dependencies

| Migration | Depends on | Confirmed |
|---|---|---|
| 012 | Nothing new (references pre-existing `leads`, `invoices`, `packages`, `knowledge_chunks` via FK only) | Yes — `012_v3_foundation_schema_ROLLBACK.sql`'s own header explicitly confirms these pre-existing tables are untouched, only referenced |
| 013 | 012 (`properties`, `inventory_items`, `reservations`) | Yes — `013_proposal_reservation_links.sql`'s header states this explicitly |
| 004 | Pre-existing `leads` (migration 001), `proposals` (migration 003) | Yes — additive columns on `leads`, no new-table cross-references |

## Rollback

All three now have reviewed rollback scripts:

| Migration | Rollback file | Reverses |
|---|---|---|
| 012 | `012_v3_foundation_schema_ROLLBACK.sql` | Drops all 16 tables 012 creates, in reverse-dependency order (children before parents), plus the 2 seed `properties` rows. Untouched: every pre-existing table. |
| 013 | `013_proposal_reservation_links_ROLLBACK.sql` | Drops only the 5 columns + 2 indexes 013 added to `proposals`. No data loss beyond those columns' values. |
| 004 | `004_phase4_campaigns_ROLLBACK.sql` (written during Go-Live Preparation — 004 had no rollback before that) | Drops all 5 tables 004 creates and the 5 columns it added to `leads`, in reverse-creation order. |

**Rollback execution order is the reverse of apply order**: 004 (if applied) → 013 → 012. `scripts/apply-v3-migrations.mjs --rollback` already enforces 013-before-012 correctly; 004's rollback is manual (`psql -f`) and must be sequenced by whoever runs it — run it first if rolling back everything, since nothing else depends on it, but it does need to happen before 012's rollback only in the sense that there's no reason to wait.

**Rollback data-loss risk:** both existing scripts (012, and by inheritance 013) explicitly warn against running against a database with real accumulated reservation data without an explicit decision to accept that loss. 004's new rollback script carries the same warning for campaign/staff-performance data. This is documented risk, not an unaddressed gap — the correct posture, not a finding.

## Idempotency

All three migrations use `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` throughout, and both seed-data `INSERT`s (012's two properties, 004's 18 festival-calendar rows and 7 notification-settings rows) use `ON CONFLICT DO NOTHING`. Confirmed safe to re-run any of the three if a partial failure occurs mid-migration — verified by direct read of all three files, not assumed from their comments.

## Foreign Keys

Confirmed via `scripts/smoke-test-v3.mjs`'s own required-FK list (the app's actual dependency list, not a superset): `reservations.property_id → properties`, `reservations.inventory_item_id → inventory_items`, `reservations.proposal_id → proposals`, `proposals.reservation_id → reservations`, `ai_interaction_log.lead_id → leads`. All five are declared in the migration files with `REFERENCES`. Migration 004 declares no new FK relationships (its tables are all standalone; `leads`'s new columns are plain values, not references).

## Indexes

`scripts/smoke-test-v3.mjs`'s required list: `idx_reservations_dates`, `idx_reservations_status`, `idx_reservations_inventory_item_id`, `idx_knowledge_sources_embedding` — all four declared in migration 012, all four are exactly what `availability-service.ts`'s overlap query and the reservation-list queries actually filter/sort on (confirmed by direct code read across prior sessions, not assumed from the index names alone). Migration 004 adds no new indexes — its tables' query patterns (Campaigns list, festival calendar lookup) don't have an established access pattern yet to index against; acceptable for initial launch given expected low row counts.

## RLS

Every table across all three migrations has `ENABLE ROW LEVEL SECURITY` plus a `service_role`-only policy (`FOR ALL USING (auth.role() = 'service_role')`) — confirmed by direct grep across all three files. This matches the project's current, deliberate architecture: the app uses the Supabase service-role client for all reservation/campaign operations rather than session-scoped RLS (a documented hybrid-architecture decision from an earlier session, not an oversight — session-scoped RLS is scoped as future work for user-facing CRUD specifically, not these newer tables).

## Smoke Test Coverage

`npm run db:smoke-test:v3` covers 012/013 exhaustively (all 16 tables, 5 proposal columns, 3 `ai_interaction_log` columns, 5 FKs, 4 indexes, RLS+policy on every table, both seed rows, plus a fully-transactional functional test of the exact overlap-detection query `availability-service.ts` uses). **No automated smoke test exists for migration 004** — `PRODUCTION_DEPLOYMENT_GUIDE.md` §7 provides manual verification SQL instead. This asymmetry is a real, minor gap: if 004 is applied, verify it manually and deliberately, not by assuming the 012/013 smoke test's green result covers it too — it does not.

## Conclusion

All three migrations are structurally sound, correctly ordered, idempotent, and now have reviewed rollback paths. The only genuine gap is procedural, not structural: 004 lacks the same automated smoke-test rigor 012/013 has. This does not block applying it — the manual verification steps in the deployment guide are adequate for its scope (5 simple tables, no complex FK/query-correctness surface like `reservations`' overlap detection) — but it should be run and checked deliberately, not assumed clean by association with 012/013's passing smoke test.
