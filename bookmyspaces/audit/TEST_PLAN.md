# TEST_PLAN.md

No test framework currently exists (ISS-031, `DEPLOYMENT_AUDIT.md`). This plan assumes Phase 1 stands up a minimal framework (Vitest recommended for Next.js 14/TypeScript compatibility) and Phase 9 builds out real coverage. Until then, "Unit"/"Integration" columns below describe what SHOULD be written once the framework exists; "Manual" is what must happen regardless, immediately, for every fix.

## Test-type matrix by issue

Legend: ● required · ○ recommended · — not applicable

| Issue | Unit | Integration | Manual | Regression | Security | Database | API | UI | Performance |
|---|---|---|---|---|---|---|---|---|---|
| ISS-001 | — | ● | ● | ● | ● | — | — | ● | — |
| ISS-002 | — | ● | ● | ● | ● | — | ● | — | — |
| ISS-003 | ○ | ● | ● | ● | ● | ○ | ● | — | — |
| ISS-004 | ● | ● | ● | ● | ● | — | ● | — | — |
| ISS-005 | ● | ○ | ● | ● | ○ | — | ● | — | — |
| ISS-006 | — | ● | ● | ● | ● | ● | ● | ● | ○ |
| ISS-007 | — | ○ | ● | ○ | ● | ● | — | — | — |
| ISS-008 | — | ○ | ● | ● | ● | ● | — | ○ (chat widget) | — |
| ISS-009 | — | ● | ● | ● | ○ | ● | ● | — | — |
| ISS-010 | — | ● | ● | ● | — | ● | ● | ○ (dashboard) | — |
| ISS-011 | — | — | ● | — | — | ○ | — | — | — |
| ISS-012 | — | — | ● | ○ | — | ● | — | — | — |
| ISS-013 | — | — | ● | — | — | — | — | — | — |
| ISS-014 | — | ○ | ● | — | — | ○ | ○ | — | — |
| ISS-015 | ○ | ○ | ● | ● | ○ | ● (if finished) | ● (if finished) | — | — |
| ISS-016 | ○ | ● | ● | ○ | — | ○ | ● | — | — |
| ISS-017 | ○ | ● | ● | ○ | — | ○ | ○ | — | — |
| ISS-018 | ○ | ● | ● | ● | — | ○ | ● | — | — |
| ISS-019 | ○ | ● | ● | ● | — | ○ | ● | — | — |
| ISS-020 | — | ● | ● | ○ | — | — | ● | — | — |
| ISS-021 | — | — | ● | — | — | — | — | — | — |
| ISS-022 | — | — | ● | — | ○ (review contents) | — | — | — | — |
| ISS-023 | — | — | ● | — | ○ | — | — | — | — |
| ISS-024 | — | — | ● | — | — | — | — | — | — |
| ISS-025 | — | — | ● | — | ● | — | — | — | — |
| ISS-026 | — | — | ● | ○ | ● | — | — | — | — |
| ISS-027 | — | ● | ● | ● | ● | — | ● | ○ | — |
| ISS-028 | — | — | ● | ○ | — | — | — | ● | — |
| ISS-029 | — | — | ● | — | — | — | — | — | — |
| ISS-030 | ○ | — | ● | ● | — | — | — | ● | — |
| ISS-031 | — | — | ● | — | — | — | — | — | — |
| ISS-032 | — | — | ● | ○ | — | — | — | ● | — |
| ISS-033 | — | ● | ● | ● | ● | — | ● | — | — |
| ISS-034 | — | — | ● | ● | ● | — | — | ● | — |
| ISS-035 | — | — | ○ | ○ | — | — | — | — | — |
| ISS-036 | ○ | ○ | ● | ● | — | — | ● | — | — |
| ISS-037 | — | — | ● | — | — | — | — | — | — |
| ISS-038 | — | — | ● | — | — | — | — | — | — |
| ISS-039 | — | — | ○ | ○ | — | — | — | — | — |
| ISS-040 | — | — | ● | ○ | ● | — | ● | — | — |
| ISS-041 | ○ | ● | ● | ● | — | — | ● | ○ | — |
| ISS-042 | ○ | ○ | ● | — | — | — | ● | — | — |
| ISS-043 | — | ○ | ● | ○ | — | — | ○ | — | — |
| ISS-044 | — | — | ● | ● | — | — | — | ● | — |
| ISS-045 | — | — | ● | ○ | — | — | — | — | ● |
| ISS-046 | — | — | ○ | — | — | — | — | — | — |
| ISS-047 | ○ | ● | ● | ○ | — | ○ | ● | — | — |
| ISS-048 | — | — | ● | — | — | ○ | — | ● | — |
| ISS-049 | — | — | ● | — | — | ● | — | — | — |
| ISS-050 | — | ○ | ● | — | — | — | — | — | — |
| ISS-051 | — | ○ | ● | ○ | — | — | ● | — | ● |
| ISS-052 | — | — | ● | — | — | — | — | ● | — |

## Detailed test scenarios for the two highest-risk phases

### Phase 2 (Authentication) — critical-path scenarios

1. **Logged-out access sweep.** In an incognito/no-session browser, attempt to load every page under `(crm)/*`, `/admin`, `/analytics`. Expected: redirect to `/auth/login` for all of them, zero exceptions.
2. **Logged-out API sweep.** Using `curl`/Postman with no auth header/cookie, hit all 26 previously-open routes from `routes.csv`. Expected: 401 for every route NOT on the explicit public allowlist (chat, webhook receivers, share-token reads, health, track-view); those allowlisted routes should still work exactly as before.
3. **Role boundary test.** Seed one `admin` user and one non-admin (`sales`/`marketing`) user in `user_profiles`. Confirm `/api/admin/users` GET/PATCH/POST succeed for the admin and return 403 for the non-admin.
4. **Session persistence.** Log in, navigate across 5+ pages, confirm session survives; log out, confirm all pages immediately require re-login.
5. **Webhook forgery test.** Send a POST to `/api/whatsapp/webhook` with an invalid/missing `X-Hub-Signature-256` header — expect rejection. Send a validly-signed test payload from Meta's test tool — expect normal processing (lead/conversation created as before).
6. **CSRF origin test.** Attempt a Server Action invocation from a non-allowlisted origin (e.g., a local test HTML file posting to the deployed app) — expect rejection after ISS-033 lands; confirm real app origin and Vercel preview URLs still work.
7. **Regression: public-facing chat widget and proposal share links** must continue to work exactly as before for anonymous customers — these are intentionally public and must not be broken by the auth rollout.

### Phase 3 (Database) — critical-path scenarios

1. **Missing-table routes end-to-end.** After ISS-009's migration lands, exercise: `/api/admin/users` (GET/PATCH/POST), `/api/proposals/[id]/invoice`, `/api/proposals/[id]/payment` (POST/GET), `/api/proposals/[id]/receipt`, `/api/leads/import` (POST/GET) — each should complete without a "relation does not exist" error.
2. **Missing-column routes end-to-end.** After ISS-010's migration lands, exercise `/api/dashboard/stats`, `/api/leads/hot`, `/api/proposals/intelligence` — confirm `lead_stage` values are now real data, not the `?? null` fallback previously observed in `leads/hot/route.ts:44`.
3. **RLS regression.** With the anon key (not service-role), attempt to read/write `notification_settings` — expect rejection after ISS-007. Attempt to UPDATE a `conversations` row belonging to a different `session_id` — expect rejection after ISS-008; attempt to UPDATE a row belonging to the SAME `session_id` (simulating the real chat widget use case) — expect success.
4. **Migration idempotency.** Re-run the new migration(s) against a copy of the database a second time — per the existing migrations' own convention (`IF NOT EXISTS` throughout), it should not error.
5. **Rollback rehearsal.** On a staging/scratch copy of the database, apply the new migration, then execute the documented rollback (`DROP` the added objects / `DISABLE ROW LEVEL SECURITY`), confirm the database returns to its exact prior state.

## Security tests (cross-cutting, run after Phase 2 and again after Phase 3)

- Attempt every route with a service-role key stolen/leaked scenario is out of scope (that's a credential-management concern, not a code test) — but confirm the service-role key is never sent to the browser (`grep` the built `.next` output for the key string, expect zero matches).
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is not logged anywhere (cross-reference ISS-039's logging cleanup).
- Re-run the original audit's `grep`-based checks (zod usage, auth-check presence, RLS-enabled statements) against the post-fix codebase to confirm the counts have moved in the expected direction (e.g., "routes with auth check" should go from 4/31 to 31/31 minus the documented public allowlist).

## Performance tests

- ISS-045 (font self-hosting): time proposal PDF generation before/after with network access to `fonts.googleapis.com` blocked in both cases.
- ISS-051 (selective caching): load-test a newly-cached route (e.g., `/api/packages` if one exists, or the equivalent read) before/after, confirm latency improvement and confirm a write still correctly invalidates the cache.
- General: after Phase 2's auth rollout, spot-check that adding a session check to every route hasn't introduced a meaningful latency regression (each `getCurrentUser()`/session-check call is an extra round-trip — acceptable but worth measuring once).

## Regression test suite (build incrementally through Phases 1–9, run before every subsequent phase)

Maintain a running checklist (manual until Phase 9 automates it) covering: login/logout, lead capture (chat + WhatsApp), lead list/filter/kanban, Excel import, AI scoring, proposal create/PDF/share/email/payment/invoice/receipt, WhatsApp send/broadcast/webhook, campaigns, analytics dashboard, admin knowledge-base upload, settings. Run this full checklist at the end of every phase in `IMPLEMENTATION_PHASES.md`, not just at the very end of the project — catching a regression from Phase 2 during Phase 3 is far cheaper than catching it in Phase 9.
