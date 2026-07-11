# MODULE_INVENTORY.md — src/modules/** (Part 6)

5 files, 619 combined LOC (VERIFIED via `wc -l`): `automation/escalation-engine.ts` (121), `followups/followup-engine.ts` (14), `followups/followup-rules.ts` (108), `leads/lead-stage-manager.ts` (202), `leads/types.ts` (174).

## Structure

```
src/modules/
  automation/
    escalation-engine.ts   — lead-level escalation rule evaluation
  followups/
    followup-engine.ts     — cadence lookup (14 lines, thin)
    followup-rules.ts      — per-temperature cadence definitions + message building
  leads/
    lead-stage-manager.ts  — lead pipeline stage state machine
    types.ts                — shared type/const definitions for the leads domain
```

## Exports (VERIFIED via `grep -n "^export "`)

- `automation/escalation-engine.ts:66` `evaluateEscalation(lead: Partial<Lead>): EscalationResult`; `:85` `applyEscalation(...)` (async).
- `followups/followup-engine.ts:1` `getFollowUpCadence(...)`.
- `followups/followup-rules.ts:9` `CadenceStep` (interface), `:14` `TemperatureCadence` (interface), `:24` `CADENCE_RULES: Record<LeadTemperature, TemperatureCadence>`, `:57` `buildFollowUpMessage(...)`, `:104` `retryDelayMinutes(attemptNumber: number): number`.
- `leads/lead-stage-manager.ts:16` `isValidStage`, `:20` `canTransition`, `:27` `isTerminalStage`, `:44` `isStale`, `:74` `transitionStage(...)` (async, performs a DB write), `:144` `autoAdvanceStage(...)` (async).
- `leads/types.ts:8` `LEAD_STAGES`, `:19` `LeadStage` (type), `:21` `LEAD_TEMPERATURES`, `:22` `LeadTemperature` (type), `:24` `URGENCY_LEVELS`, `:25` `UrgencyLevel` (type), `:31` `VALID_TRANSITIONS: Record<LeadStage, LeadStage[]>`, `:44` `Lead` (interface), `:100` `FollowUpQueueItem`, `:123` `StageTransition`, `:137` `ScheduleResult`, `:146` `EscalationResult`, `:154` `PipelineStat`, `:164` `DashboardSummary`.

## Dependencies (internal imports, VERIFIED via `grep -n "^import"`)

- `escalation-engine.ts:6` imports `getSupabaseAdmin` from `@/lib/supabase`; `:7` imports `Lead, EscalationResult` from `../leads/types`.
- `followup-rules.ts:5` imports `LeadTemperature` from `../leads/types`.
- `lead-stage-manager.ts:6` imports `getSupabaseAdmin` from `@/lib/supabase`; `:7` imports from `./types` (leads types).

## Reachability — VERIFIED, this is the headline finding for Part 6

A repo-wide search (`grep -rln`, matching each module filename against every `.ts`/`.tsx` file under `src/app`, `src/lib`, `src/services`, excluding files inside `src/modules` itself) found:

| Module file | Importers found |
|---|---|
| `automation/escalation-engine.ts` | **NONE** — zero importers anywhere in the codebase. |
| `followups/followup-engine.ts` | **NONE** — zero importers anywhere in the codebase. |
| `followups/followup-rules.ts` | **NONE** — zero importers anywhere in the codebase. |
| `leads/lead-stage-manager.ts` | **1** — `src/app/api/leads/[id]/stage/lead-stage-route.ts`, which is itself dead code (misnamed, not registered as a Next.js route — see ROUTES.md). So this file is also effectively unreachable in the running application. |
| `leads/types.ts` | **1 live usage** — `src/app/api/dashboard/stats/route.ts:10`: `import { DashboardSummary } from '@/modules/leads/types'` (type-only import; the `LeadStage`/`VALID_TRANSITIONS`/etc. runtime values are not imported by this route, only the `DashboardSummary` type). |

**Conclusion: of 619 total lines across `src/modules/**`, only a single type-only import (`DashboardSummary` in one route) is verified to be live/reachable. The escalation engine, the follow-up cadence engine, and the lead-stage state machine — three distinct pieces of business logic that read as core CRM functionality (automated escalation, follow-up scheduling rules, and pipeline stage transition validation) — are all unreferenced by any reachable code path in this repository.**

## TODO / FIXME / unhandled promises

VERIFIED zero `TODO`/`FIXME` matches across all 5 files. `applyEscalation` (`escalation-engine.ts:85`) and `transitionStage`/`autoAdvanceStage` (`lead-stage-manager.ts:74,144`) are `async` functions that perform DB writes via `getSupabaseAdmin()`; whether their callers (were they reachable) properly await and handle errors was not evaluated further given the functions themselves have no live callers.

## UNINSPECTED ITEMS (Part 6 scope)

None — all 5 files' export/import lines were read directly; full function-body review was not performed (not required to answer reachability, which was the material question for this Part), so internal logic correctness (e.g., whether `VALID_TRANSITIONS` correctly models the intended pipeline) is NOT VERIFIED / out of scope for a structural inventory.
