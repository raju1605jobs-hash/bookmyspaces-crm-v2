# IMPLEMENTATION_PHASES.md

Planning only — no code has been written or modified as part of producing this document. Effort estimates assume one full-time engineer familiar with this codebase (already ramped, not learning it from scratch) and no test framework existing until Phase 1 stands one up. Hours are ranges to reflect uncertainty documented per-issue in `MASTER_ISSUE_REGISTER.csv`.

---

## Phase 0 — Backup, Branching, Investigation

**Objectives:** Create a safe working foundation and resolve the unknowns that block later phases before any code changes begin.

**Tasks:**
- Create a dedicated git branch for this remediation effort; confirm `.git` state is clean and push a tag/backup point of current `main`/production branch.
- Take a full Supabase database backup (Supabase dashboard → Database → Backups, or `pg_dump` against the project) before any migration work in later phases.
- ISS-011: investigate migration `009` gap (git log, Supabase migration history table if used).
- ISS-049: connect to the live Supabase project and query `information_schema.tables`/`information_schema.columns` to resolve ISS-009 and ISS-010's open question (schema drift vs. genuinely missing).
- ISS-025: open and review the stray root files (`git`, `npm`, `latest.json`, `logs.json`, `logs.txt`, `all_routes.txt`, `deployed_route.txt`, `deployment-trigger.txt`) to classify as routine cleanup vs. sensitive-data incident.

**Expected deliverables:** A branch and DB backup that every later phase can roll back to; a written answer (even if "unknown, needs the user's Supabase dashboard access") for ISS-011 and ISS-049; a classification decision for ISS-025.

**Verification:** Backup restore tested once on a scratch/staging project if available; branch exists and is pushed; investigation findings documented in the issue register (update ISS-009/010/011/025 status from Blocked).

**Exit criteria:** ISS-009 and ISS-010 have a confirmed root cause (even if the confirmed answer is "genuinely missing, needs a new migration" — the point is removing ambiguity, not necessarily fixing it yet). ISS-025 is classified.

**Estimated hours:** 4–10 (mostly dependent on how quickly live-DB access can be obtained from the user).

---

## Phase 1 — Critical Security (immediate, low-risk wins)

**Objectives:** Close the highest-severity, lowest-effort gaps first — the ones that are both dangerous and cheap to fix, so risk drops fast before the larger auth/database phases begin.

**Tasks:**
- ISS-040: delete the 5-line invoice debug logging block dumping payment data.
- ISS-031: scaffold a minimal test framework (Vitest or Jest — recommend Vitest given the Next.js 14/TypeScript stack) with zero test coverage requirement yet; just get `npm test` working so later phases can add tests as they go rather than doing it all at once at the end.
- If ISS-025 investigation revealed sensitive data in committed files: begin credential rotation and git-history remediation as its own urgent sub-track (this supersedes normal phase ordering if triggered).

**Expected deliverables:** Invoice route no longer logs payment data; `npm test` runs (even against a trivial placeholder test) and is wired into whatever CI exists or is being planned.

**Verification:** Trigger invoice generation, confirm no payment data in logs. Run `npm test`, confirm exit code 0.

**Exit criteria:** No known active data-leak in application logs; a test command exists and passes.

**Estimated hours:** 4–8.

---

## Phase 2 — Authentication

**Objectives:** Make "logged in" and "authorized" mean something everywhere in the application — this is the single highest-impact phase in the entire roadmap.

**Tasks:**
- Resolve ISS-006 design decision (service-role-everywhere + route-level auth, vs. migrate to session-scoped clients + real RLS) — **this is a decision for you and the engineering lead to make together before code starts; the roadmap recommends the route-level-auth path as faster and lower-risk given RLS policies are already inconsistent (see ISS-007/008), but a full RLS-based redesign is the more defensible long-term architecture.**
- ISS-001: implement real session-checking logic in `src/middleware.ts`; delete the dead root `middleware.ts` (ISS-026) once confirmed.
- ISS-002: add auth checks to the 26 currently-open API routes, explicitly allowlisting the routes that must remain public (chat, webhook receivers, share-token reads, health check, track-view) rather than leaving them open by omission.
- ISS-003: fix the admin role check to query `user_profiles.role` (depends on ISS-009 resolving whether `user_profiles` exists).
- ISS-004: add Meta webhook signature verification to the WhatsApp webhook POST handler.
- ISS-027 + ISS-028: consolidate the two OAuth callback implementations into one, fix the broken failure-redirect target.
- ISS-033: restrict Server Actions `allowedOrigins` to actual production/preview domains.

**Expected deliverables:** Every page requires a valid session; every API route either requires auth or is on an explicit, documented public allowlist; admin role checks work correctly; webhook rejects forged payloads; one OAuth callback implementation remains.

**Verification:** Manual click-through of every route logged out (must redirect/401) and logged in as each role (admin, non-admin) (must behave correctly per role). Forged webhook payload rejected; valid Meta payload still processed.

**Exit criteria:** Zero routes/pages reachable without appropriate authorization, verified by the manual pass above (automated route-guard tests can follow once Phase 9 testing work matures).

**Estimated hours:** 40–70 (this is the largest and highest-risk phase; the range reflects the ISS-006 decision's impact on scope).

---

## Phase 3 — Database

**Objectives:** Make the schema match what the application code actually expects, and close the RLS gaps found in the audit.

**Tasks:**
- ISS-009: write the migration for `active_users_view`, `invoices`, `lead_imports`, `payments`, `user_profiles` (exact shape informed by Phase 0's live-DB investigation).
- ISS-010: write the migration adding `leads.lead_stage`.
- ISS-007: `ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY`.
- ISS-008: scope the `conversations` anon UPDATE policy to the requesting session instead of `USING (TRUE)`.
- ISS-012: clean up the triple-defined `leads_needing_followup` view (keep one canonical definition).
- ISS-013: remove the duplicate `007_missing_tables.sql` at the repo root once confirmed identical.

**Expected deliverables:** A new, numbered migration (or set of migrations) that closes the schema gap; RLS gap closed; policy tightened.

**Verification:** Every route in `routes.csv` whose `tables_touched` column includes the previously-missing identifiers now succeeds end-to-end (admin/users, proposals/[id]/invoice, proposals/[id]/payment, proposals/[id]/receipt, leads/import). Anon-key access to `notification_settings` and cross-session `conversations` updates now correctly rejected.

**Exit criteria:** Schema in `supabase/migrations/` fully matches what live route code queries; no more silent-failure risk from missing tables/columns.

**Estimated hours:** 16–30 (depends heavily on what Phase 0 discovers — additive migration is fast, reverse-engineering an undocumented live schema is slower).

---

## Phase 4 — Infrastructure Cleanup

**Objectives:** Remove dead weight and fix filesystem-level confusion so the codebase reflects reality.

**Tasks:**
- ISS-019 + ISS-020: rename the 2 misnamed route files so they register correctly; verify the lead-stage endpoint works (needs ISS-010 done first).
- ISS-021: delete the 3 empty brace-glob directories + 1 empty stray directory.
- ISS-022: review and remove the stray `.zip` in the invoice route folder.
- ISS-023: diff `BOOKMYSPACES_BACKUP/` against the live app; remove only after explicit user confirmation nothing unique is lost.
- ISS-024: review the 8 historical fix scripts; remove any confirmed unused by tooling/docs.
- ISS-026: remove the dead root `middleware.ts` (confirmed safe once Phase 2 lands).
- ISS-032: determine which Tailwind config file is actually active, remove the other.

**Expected deliverables:** Clean `src/app/api` tree with no dead directories; no duplicate/confusing config files; no stray archives.

**Verification:** `npm run build` succeeds after each removal; app renders identically (visual spot-check) after Tailwind config dedupe.

**Exit criteria:** Repository structure matches `PROJECT_DISCOVERY.md`'s "should be" state, i.e., every file present has a clear, single purpose.

**Estimated hours:** 10–18 (ISS-023 and ISS-024 timing depends on user review turnaround).

---

## Phase 5 — Business Logic

**Objectives:** Reconnect or retire the dead business-logic modules found in the audit so the CRM's automation actually runs as designed.

**Tasks:**
- ISS-015: make the scoping decision (finish-and-wire vs. delete the WhatsApp v2 subsystem); execute accordingly.
- ISS-016: wire `/api/ai-summary` to call the already-written `generateDailySummary`/`sendDailySummaryWhatsApp`/`detectAndFlagVIPLeads`.
- ISS-017: wire the escalation engine into whichever trigger point makes sense (route or scheduled job) — product decision needed on when escalation should fire.
- ISS-018: reconcile the follow-up cadence module against whatever currently drives `/api/cron/followups`, then wire in whichever logic wins.
- ISS-005: add zod validation to all 31 routes, prioritizing the highest-risk ones first (admin/users, proposals/[id]/payment, leads POST/PATCH).
- ISS-042: fix the unawaited fire-and-forget write in the proposal email route.
- ISS-014: (optional) move the hardcoded notification phone number to a settings-page-editable value.

**Expected deliverables:** Daily AI summary runs and delivers; escalation engine fires on real trigger conditions; follow-up cadence is driven by one consistent system; every route validates its input.

**Verification:** Trigger each previously-dead code path manually and confirm expected side effects (DB row written, WhatsApp send attempted, etc.). Send malformed payloads to validated routes, confirm 400 responses.

**Exit criteria:** No business-logic module in `src/modules/` or `src/lib/` is unreachable; all routes validate input.

**Estimated hours:** 30–55 (ISS-015's scope swings this significantly depending on finish-vs-delete).

---

## Phase 6 — Integrations

**Objectives:** Make third-party-facing features (email, WhatsApp pricing accuracy) actually do what they claim to do.

**Tasks:**
- ISS-041: integrate a real transactional email provider (SendGrid/Resend/SES) for proposal delivery; keep the `mailto:` response as a fallback if desired.
- ISS-047: rewrite the WhatsApp auto-reply to pull live pricing from the `packages` table instead of hardcoded copy.
- ISS-043: dedupe the two Meta Graph API call implementations (resolved as a side effect of the ISS-015 decision in Phase 5, verified here).

**Expected deliverables:** Proposal emails are actually delivered via a real provider; WhatsApp auto-replies quote correct, current pricing.

**Verification:** End-to-end send test for proposal email (real inbox check); WhatsApp test message containing "price" returns current seeded package prices.

**Exit criteria:** No integration in the CRM's feature list (per the original project brief: WhatsApp, Email) silently does something other than what it claims.

**Estimated hours:** 12–20.

---

## Phase 7 — UI

**Objectives:** Close the small number of frontend gaps found in the audit.

**Tasks:**
- ISS-028: fix or build the missing `/auth/auth-code-error` page (or redirect to `/auth/login` with an error query param, consistent with the surviving OAuth callback from Phase 2).

**Expected deliverables:** No broken redirect targets remain.

**Verification:** Trigger a failed OAuth/magic-link exchange, confirm a sensible page renders.

**Exit criteria:** Zero known 404s in any application-controlled redirect flow.

**Estimated hours:** 1–2.

---

## Phase 8 — Performance & Code Quality (mostly Deferred-priority, schedule around capacity)

**Objectives:** Pay down the maintainability and performance debt that doesn't block a stable release but will slow future development if left unaddressed.

**Tasks:**
- ISS-036 + ISS-037 + ISS-038 + ISS-029: build a centralized env-config module, fix `.env.example` to match reality, remove/document unused vars.
- ISS-034: add baseline security headers (CSP tuned carefully against the chat widget/fonts/third-party embeds actually in use).
- ISS-030: incrementally extract `HotLeadDashboard.tsx` into `src/components/` pieces (only after Phase 1's test scaffold exists, and ideally with real test coverage on the dashboard by then).
- ISS-035: reduce `any`-type usage incrementally, file by file.
- ISS-039: replace/remove the 89 `console.*` calls with the existing `src/lib/logger.ts`.
- ISS-044: centralize hardcoded business contact info/pricing into one constants module.
- ISS-045: self-host or build-time-inline the proposal PDF fonts instead of a live Google Fonts fetch.
- ISS-046: consolidate the duplicate `CookieItem` interface.
- ISS-051: opt specific read-heavy, rarely-changing routes (packages, festival_calendar) out of the blanket `no-store` cache policy.

**Expected deliverables:** Centralized, documented configuration; hardened response headers; smaller/more testable dashboard component; reduced `any` usage; consistent logging; DRY constants; faster/more reliable PDF generation; smarter caching.

**Verification:** Per-item as listed in `MASTER_ISSUE_REGISTER.csv` "Testing Required" column.

**Exit criteria:** This phase has no hard exit criteria — it is ongoing improvement work, prioritized by team capacity after Phases 0–7 land.

**Estimated hours:** 40–70 total across all sub-items, spread over time (not a blocking sequential phase).

---

## Phase 9 — Testing

**Objectives:** Build real test coverage now that the app's behavior is stabilized by Phases 1–7, and close the audit's remaining verification gaps.

**Tasks:**
- Write integration tests for every route touched in Phases 2, 3, 5, 6 (auth enforcement, database writes, business-logic wiring).
- ISS-048: manually verify none of the 12 in-scope CRM pages render mock/fake data instead of live data.
- ISS-052: review the 2 previously out-of-scope pages (`src/app/page.tsx`, login page) for the same quality bar as the rest.
- Add regression tests for every issue fixed in Phases 1–8 per the CSV's "Testing Required" column.

**Expected deliverables:** A meaningful automated test suite covering auth, the database layer, and core CRM workflows (lead → proposal → payment).

**Verification:** `npm test` passes in CI (or locally if CI isn't set up yet); manual QA checklist completed for all 12+2 pages.

**Exit criteria:** Core user journeys (login, lead capture, proposal send, payment record, WhatsApp send) have automated coverage; no known mock-data pages remain in production paths.

**Estimated hours:** 30–50.

---

## Phase 10 — Production Readiness

**Objectives:** Deliver on the original project brief's goal — "install and immediately start using it" — for any future deployment of this CRM.

**Tasks:**
- ISS-050: build a startup environment-validation check (fails fast with a clear message if required vars are missing) and a setup guide/wizard.
- Final full-repo verification pass: build succeeds, lint passes, type-check passes, no known Critical/High issues remain open in the register.
- Deployment runbook: document the backup/rollback procedure used in Phase 0 as a repeatable, documented process for future changes.

**Expected deliverables:** A documented, verifiable, fresh-clone-to-running-app setup path; a production readiness sign-off referencing this register.

**Verification:** A fresh clone, following only the written setup docs, results in a working app without needing this audit's tribal knowledge.

**Exit criteria:** All items in `PRODUCTION_CHECKLIST`-style criteria (see `PRODUCTION_SCORECARD.md`) are met; no Critical or High severity issue remains open in `MASTER_ISSUE_REGISTER.csv`.

**Estimated hours:** 12–20.

---

## Total estimated effort across all phases

**~200–355 hours** (roughly 5–9 weeks for one full-time engineer, or 2.5–4.5 weeks for a two-person team working Phases in parallel where the dependency graph allows). See `EXECUTIVE_SUMMARY.md` for the effort breakdown by priority tier and a recommended staffing approach.
