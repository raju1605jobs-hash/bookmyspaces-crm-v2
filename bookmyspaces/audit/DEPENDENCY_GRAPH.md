# DEPENDENCY_GRAPH.md

Maps which issues block others, which can run in parallel, and where a design decision (not just a code change) is the real prerequisite.

## Root blockers (must resolve first — everything else fans out from these)

```
ISS-049  Live-DB investigation (are the 5 missing tables + lead_stage
         column real schema drift, or genuinely absent?)
   │
   ├──▶ ISS-009  Write migration for active_users_view / invoices /
   │             lead_imports / payments / user_profiles
   │       │
   │       └──▶ ISS-003  Admin role check fix (needs user_profiles
   │                      queryable to join against)
   │
   └──▶ ISS-010  Write migration for leads.lead_stage
           │
           └──▶ (unblocks dashboard/stats, leads/hot, proposals/
                 intelligence returning correct data)

ISS-025  Review stray root files (git, npm, latest.json, logs.json,
         logs.txt, all_routes.txt) for sensitive content
   │
   └──▶ IF sensitive data found: becomes a Critical security-incident
        track (credential rotation + git history purge) that pre-empts
        everything else in Phase 1
   └──▶ IF clean: folds into routine Phase 4 cleanup (ISS-021/022/023/024)

ISS-006  Design decision: keep service-role-everywhere architecture
         (with route-level auth as the real boundary) vs. migrate to
         session-scoped clients + real RLS enforcement
   │
   └──▶ Determines HOW ISS-002 (add auth to 26 routes) is implemented -
        must be decided before ISS-002 work starts, not after
```

## Security / Auth chain

```
ISS-001 (middleware no-op)
   │
   ├──▶ ISS-026 (remove dead duplicate middleware.ts) — trivial once
   │            ISS-001's fix is confirmed live in src/middleware.ts
   │
   └──▶ enables meaningful use of:
          ISS-002 (per-route auth) — can start in parallel with ISS-001,
                    but both should land together since a route-level
                    check without middleware still leaves other pages
                    unprotected, and vice versa
          ISS-033 (CSRF origin restriction) — independent, no code
                    dependency, but same review pass makes sense

ISS-002 (26 routes need auth)
   │
   ├──requires──▶ ISS-006 decision (service-role vs session-scoped)
   │
   └──▶ ISS-003 (admin role check) is a SPECIFIC INSTANCE of this
                work for one route — fix it as part of the same pass,
                but it additionally needs ISS-009 (user_profiles must
                exist) resolved first

ISS-004 (webhook signature verification) — independent of ISS-001/002,
         can run in parallel; only touches src/app/api/whatsapp/webhook/route.ts

ISS-027 (duplicate OAuth callbacks) — should be resolved alongside
         ISS-001/002 since consolidating auth logic is naturally the
         same body of work; ISS-028 (broken redirect target) is a
         one-line follow-on fix once ISS-027 picks the surviving
         implementation
```

## Database chain

```
ISS-049 (investigation)
   ├──▶ ISS-009 (missing tables migration)
   ├──▶ ISS-010 (missing column migration)
   └──▶ informs whether ISS-006's service-role decision needs to
        account for tables that may not have RLS policies yet either

ISS-007 (notification_settings RLS gap) — independent, no dependency,
         can be fixed immediately, any time in Phase 3

ISS-008 (conversations anon UPDATE unscoped) — independent, but should
         be tested alongside the live chat widget to avoid breaking it;
         no code dependency on other issues

ISS-011 (missing migration 009) — pure investigation, no dependency,
         cheapest to resolve first (Phase 0) since it may reveal
         whether other "missing" schema (ISS-009/010) was actually in
         the lost migration 009

ISS-012 (leads_needing_followup defined 3x) and ISS-013 (duplicate
         007_missing_tables.sql) — pure cleanup, no dependency on
         anything, safe to defer indefinitely
```

## Dead-code / business-logic chain

```
ISS-020 (rename 2 misnamed route files)
   │
   └──▶ ISS-019 (lead-stage-manager becomes reachable once its route
                is correctly named) — but ALSO needs ISS-010 (lead_stage
                column) resolved first, since the state machine reads/
                writes that column

ISS-015 (dead WhatsApp v2 subsystem) — SCOPING DECISION REQUIRED:
   │  finish-and-wire-in  vs.  delete
   │
   ├──if finish──▶ requires a NEW migration for whatsapp_messages/
   │               whatsapp_conversations tables (not yet written,
   │               would become a new issue) + ISS-043 (dedupe the
   │               two Meta API call implementations) resolves
   │               naturally as part of this path
   │
   └──if delete──▶ ISS-043 resolves by deleting the losing copy too;
                   no migration needed

ISS-016 (ai-summary.ts unreachable) — independent, one route file,
         no dependency on anything else; cheap win

ISS-017 (escalation engine unreachable) — independent, but decide
         WHERE it should be invoked from (needs a product decision:
         cron job vs. inline on lead update) before wiring

ISS-018 (follow-up engine unreachable) — BLOCKED on first understanding
         what logic currently drives src/app/api/cron/followups/route.ts,
         to avoid shipping two competing cadence systems simultaneously
```

## Parallelizable work (no cross-dependencies, can run concurrently once Phase 0 investigation is done)

- ISS-021, ISS-022, ISS-023, ISS-024 (repo hygiene cleanup) — fully independent of each other and of every other track.
- ISS-032 (Tailwind config dedupe) — independent, pure frontend config.
- ISS-036 + ISS-037 + ISS-038 + ISS-029 (env var centralization + doc fixes) — one cohesive body of work, independent of security/database tracks.
- ISS-040 (remove invoice debug logging) — trivial, zero dependencies, can happen same day as the audit is read.
- ISS-044, ISS-045, ISS-046, ISS-035, ISS-039, ISS-051 (code-quality/performance cleanup) — all independent, all Deferred-priority, safe to schedule whenever capacity allows.
- ISS-041 (real email sending), ISS-047 (fix auto-reply pricing) — independent of the security/database tracks, but ISS-047 benefits from being done after ISS-010/ISS-009 if the packages/pricing logic ever needs to join against lead data.
- ISS-030 (HotLeadDashboard refactor) — fully independent, purely internal to one file, but Large effort — schedule only when ISS-031 (tests) exists so the refactor can be verified safely.

## Testing dependency (cross-cutting)

```
ISS-031 (no tests exist)
   │
   └──▶ Every OTHER issue's "Testing Required" column in the CSV
        currently means MANUAL testing. Standing up even a minimal
        test framework (Phase 0/1) before the bulk of Phase 2 onward
        does not block those phases, but doing it FIRST materially
        reduces the regression risk of every subsequent phase,
        especially ISS-002 (26-route auth rollout) and ISS-006
        (service-role architecture change) which are the two highest
        blast-radius changes in this entire register.
```

## Summary: recommended resolution order at the dependency level

1. **ISS-011, ISS-049, ISS-025** — cheap investigations, no code risk, unblock everything downstream. (Phase 0)
2. **ISS-040** — trivial, do immediately regardless of phase. (Phase 1)
3. **ISS-031 (test framework scaffold only, not full coverage)** — do early so later phases have a safety net. (Phase 1)
4. **ISS-006 decision, then ISS-001 + ISS-002 + ISS-003 + ISS-004 + ISS-027 + ISS-033** together as the Phase 2 security pass.
5. **ISS-009 + ISS-010** (now unblocked by step 1) **+ ISS-007 + ISS-008 + ISS-012 + ISS-013** as the Phase 3 database pass.
6. **ISS-019, ISS-020, ISS-021, ISS-022, ISS-023, ISS-024, ISS-026, ISS-032** as the Phase 4 infrastructure/cleanup pass — mostly parallelizable.
7. **ISS-005, ISS-015 (after scoping decision), ISS-016, ISS-017, ISS-018 (after reconciliation), ISS-042** as the Phase 5 business-logic pass.
8. **ISS-041, ISS-043, ISS-047** as the Phase 6 integrations pass.
9. **ISS-028** small frontend fix, anywhere in Phase 7.
10. Everything Deferred (ISS-014, 029, 030, 034, 035, 036, 037, 038, 039, 044, 045, 046, 048, 051, 052) as ongoing Phase 8/9/10 work, scheduled around capacity.
