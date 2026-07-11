# IMPLEMENTATION_ORDER.md

Exact sequencing for all 52 issues. "Order" is global (not per-phase) — it reflects the true dependency chain from `DEPENDENCY_GRAPH.md`, not just phase grouping. Full evidence/effort/impact detail lives in `MASTER_ISSUE_REGISTER.csv`; this document adds only what's needed to sequence and verify each step safely.

| # | Issue | Reason for this position | Prerequisites | Verification after completion | Rollback strategy |
|---|---|---|---|---|---|
| 1 | ISS-011 | Cheapest possible investigation; may explain other gaps before any code is touched | None | Written answer recorded in register | N/A (investigation only) |
| 2 | ISS-049 | Unblocks 2 Critical issues (ISS-009, ISS-010) and informs the ISS-006 decision | None | `information_schema` query results documented | N/A (investigation only) |
| 3 | ISS-025 | Must classify before any cleanup phase touches these files; could escalate to a security incident | None | Contents reviewed, classified, documented | N/A (investigation only) |
| 4 | ISS-040 | Trivial, zero dependency, stops an active data leak in logs today | None | Trigger invoice route, confirm no payment data in logs | Revert single commit |
| 5 | ISS-031 (scaffold only) | Gives every subsequent phase a safety net; cheap to stand up before the big auth/DB changes | None | `npm test` runs and exits 0 | Remove test tooling if it conflicts with build |
| 6 | ISS-006 | Architectural decision that determines HOW ISS-002 and ISS-003 are implemented — must be decided, not coded, first | Steps 1-5 | Written decision + rationale recorded in register | N/A (decision only) |
| 7 | ISS-001 | Root cause of the app-wide auth gap; fix before per-route work so both layers land together | Step 6 | Logged-out visit to any `(crm)`/`admin`/`analytics` page redirects to login | Revert `src/middleware.ts` to prior no-op |
| 8 | ISS-026 | Trivial cleanup, safe only once ISS-001's replacement is confirmed live | Step 7 | Confirm `src/middleware.ts` is the sole middleware file, build succeeds | Restore file from git history |
| 9 | ISS-002 | The other half of closing the auth gap; implemented per the ISS-006 decision | Step 6, and ideally step 7 landed first so page + API protection ship together | Per-route: unauthenticated request rejected, authenticated request succeeds | Revert per-route, each independently |
| 10 | ISS-004 | Independent of ISS-001/002, but same security review pass; closes a forgeable-input hole | None (can run in parallel with 7-9) | Forged webhook payload rejected; valid Meta payload still processed | Revert single file |
| 11 | ISS-027 | Naturally grouped with the auth consolidation work in step 9 | Step 9 (auth pattern should be consistent across both callback routes) | Both magic-link and OAuth flows tested against the surviving implementation | Revert to prior dual-implementation state |
| 12 | ISS-028 | One-line follow-on once step 11 picks the surviving callback implementation | Step 11 | Trigger a failed code exchange, confirm sensible page/redirect | Revert single file |
| 13 | ISS-033 | Same security review pass as steps 7-12, independent code change | None | Server Actions work from real domain + Vercel preview URLs after restricting origins | Revert `next.config.js` origins array |
| 14 | ISS-009 | Now unblocked by step 2; Critical, blocks admin panel/payments/invoices/lead import | Step 2 | Every route touching these 5 identifiers (routes.csv) succeeds end-to-end | New migration is additive; drop the added objects if needed |
| 15 | ISS-003 | Needs `user_profiles` queryable (step 14) before the join-based fix can be verified live | Step 9 (code pattern), Step 14 (data layer) | Log in as seeded admin (200) and non-admin (403) | Revert single file |
| 16 | ISS-010 | Now unblocked by step 2; Critical, blocks dashboard/lead-pipeline features | Step 2 | dashboard/stats and leads/hot return real stage data, not `null` fallback | New column is additive; drop if needed |
| 17 | ISS-007 | Independent one-line RLS fix, no dependency | None | Anon-key access to `notification_settings` now blocked; service-role access unaffected | Single `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` to revert |
| 18 | ISS-008 | Independent RLS fix; test against live chat widget to avoid breaking it | None | Chat widget can still update its own conversation; cross-session update now rejected | Revert to `USING (TRUE)` policy |
| 19 | ISS-012 | Pure cleanup, no dependency, cheap while already in migration files for steps 14/16/17/18 | None | Live view matches intended (006) definition | Revert migration file |
| 20 | ISS-013 | Pure cleanup, no dependency | Confirm files still identical (per Phase 0 findings) | `find` confirms only one copy remains, build unaffected | Restore file from git history |
| 21 | ISS-020 | Rename before anything depends on the correct route path | None | Both renamed routes now respond (200/expected codes) instead of 404 | Revert filename |
| 22 | ISS-019 | The lead-stage endpoint needs both its filename (step 21) and the `lead_stage` column (step 16) to be fully functional | Step 16, Step 21 | PATCH with valid/invalid transitions returns expected 200/400 | Revert filename |
| 23 | ISS-021 | Pure cleanup, no dependency | None | Directories removed, build succeeds | Recreate directories (trivial, no data) |
| 24 | ISS-022 | Review contents (per audit note) before deleting, in case of unmerged work | None | Zip contents reviewed and confirmed disposable, then removed | Restore from git history |
| 25 | ISS-032 | Determine active Tailwind config before removing the other | None | Visual confirmation of which file's changes render, other file removed | Restore removed config file |
| 26 | ISS-023 | Requires explicit user sign-off; diff against live app first | User confirmation | Diff reviewed, confirmed no unique content lost | Restore from git history if anything was needed |
| 27 | ISS-024 | Review each script's continued relevance before removing | None | Confirmed unreferenced by scripts/docs/CI, then removed | Restore from git history |
| 28 | ISS-015 (scoping decision) | Must decide finish-vs-delete before touching either WhatsApp implementation | None | Written decision recorded in register | N/A (decision only) |
| 29 | ISS-043 | Resolves automatically once step 28 executes (dedupe happens as a side effect) | Step 28 | Only one Meta Graph API call implementation remains in the codebase | Revert to prior dual-implementation state |
| 30 | ISS-005 | Add validation now that the route surface is stable post-auth/DB work; prioritize highest-risk routes first | Steps 9, 14, 16 (routes should be stable before layering validation on top) | Valid payloads still work; invalid payloads return 400 with clear messages | Revert per-route |
| 31 | ISS-016 | Independent, cheap win, no blocker | None | Route triggers real summary generation + WhatsApp send attempt | Revert route file to stub |
| 32 | ISS-042 | Small fix, same file family as step 30's validation work | None | Forced failure now surfaces in logs instead of silently vanishing | Revert single file |
| 33 | ISS-017 | Needs a product decision on trigger point before wiring | Product decision (cron vs. inline) | Trigger conditions correctly create escalation records | Revert wiring change |
| 34 | ISS-018 | Needs reconciliation with existing cron/followups behavior first | Investigation of current cron logic | Follow-up scheduling behavior matches intended cadence rules post-switch | Revert wiring change |
| 35 | ISS-014 | Optional, low priority, convenient to batch with other DB-adjacent work | None | Settings UI can update the value without a new migration | Revert to hardcoded seed |
| 36 | ISS-041 | New integration, additive, independent of other tracks | None | Real test proposal email delivered end-to-end | Feature-flag back to mailto-only fallback |
| 37 | ISS-047 | Benefits from packages-table familiarity gained in step 36's area of the codebase | None | WhatsApp "price" query returns real seeded package prices | Revert single function |
| 38 | ISS-028 (verification) | Already fixed in step 12; confirmed here as part of the UI pass | Step 12 | No known 404s in redirect flows | N/A |
| 39 | ISS-036 | Env centralization; independent of security/DB tracks, safe any time after core stability | None | App boots and every feature works after each file migrates to central config | Revert per-file |
| 40 | ISS-037 | Fix `.env.example` alongside step 39's centralization work | Step 39 (informs correct final variable names) | Fresh clone + `.env.example` fill-in runs the app | Revert documentation file |
| 41 | ISS-038 | Cleanup alongside steps 39-40 | Step 40 | Unused vars removed or clearly marked | Revert documentation file |
| 42 | ISS-029 | Specific instance of step 41, same batch | Step 41 | Confirmed zero usage, removed | Revert documentation file |
| 43 | ISS-034 | Security headers; do after auth/CSRF work (steps 7-13) so the full security posture is addressed together, but not blocking | Steps 7-13 recommended first | Full click-through with no CSP console violations | Revert `next.config.js` headers() |
| 44 | ISS-039 | Mechanical logging cleanup, safe any time | None | Spot-check no load-bearing side effects lost | Revert per-file |
| 45 | ISS-044 | Centralize hardcoded contact info; independent | None | All rendered messages/PDFs/prompts show correct, consistent values | Revert per-file |
| 46 | ISS-045 | Font self-hosting; independent, low priority | None | PDF generation works with fonts.googleapis.com blocked | Revert to live font fetch |
| 47 | ISS-046 | Trivial interface dedupe | None | Type-check passes after consolidation | Revert single file |
| 48 | ISS-035 | Largest cumulative Deferred item; do incrementally, file by file, whenever capacity allows | ISS-031 test coverage recommended first | `tsc --noEmit` clean after each batch | Revert per-file |
| 49 | ISS-030 | Highest-risk Deferred item; only after real test coverage exists (post-Phase 9) | ISS-031 (real coverage, not just scaffold) | Visual regression test before/after each extraction step | Revert per extraction step |
| 50 | ISS-051 | Performance tuning, do after core stability, low risk | None | Load-test confirms latency improvement and correct write-invalidation | Revert per-route cache header |
| 51 | ISS-048 | Manual QA pass, do once UI is otherwise stable (post-Phase 7) | None | Each page's numbers cross-checked against direct Supabase queries | N/A (verification only) |
| 52 | ISS-052 | Manual QA pass on previously out-of-scope pages, same batch as step 51 | None | Landing/login pages reviewed to the same bar as the other 12 | N/A (verification only) |
| 53 | ISS-050 | Final production-readiness item; depends on steps 39-42 (env work) being complete so the validation check has something correct to validate against | Steps 39-42 | Fresh clone, following only written docs, results in a working app | Revert startup-check addition |

Note: 53 rows for 52 issues because ISS-028 legitimately appears twice — once as the actual fix (step 12, dependent on step 11) and once as a final confirmation during the UI-focused pass (step 38) — this is intentional, not a duplicate issue.
