# NEXT_STEPS.md

Immediate, concrete next actions. This is planning only — none of these have been executed.

## Decisions only you (and your engineering lead, if you have one) can make

These block Phase 2 and Phase 5 respectively and should be decided before implementation work starts, not mid-phase:

1. **ISS-006:** Keep the current "service-role key everywhere, protect at the API-route layer" architecture and simply add auth checks to every route (faster, lower-risk, less "correct" long-term) — or migrate toward session-scoped clients with real Row Level Security doing the enforcement (more defensible architecture, larger and riskier change). The roadmap's default assumption (`IMPLEMENTATION_PHASES.md` Phase 2) is the first option, but this is your call.
2. **ISS-015:** Finish and wire in the more sophisticated (but currently dead) WhatsApp conversation-state-machine subsystem, or delete it and keep the simpler live keyword-matching auto-reply. Finishing it requires writing a new database migration for tables that don't exist yet; deleting it is fast but discards real engineering work.
3. **ISS-017 / ISS-018:** Where and how should the escalation engine and follow-up cadence engine actually trigger (a scheduled job vs. inline on every lead update)? This is a product/ops decision about how aggressive you want automated customer outreach to be.
4. **ISS-023:** Explicit sign-off to delete `BOOKMYSPACES_BACKUP/` (a full duplicate of an earlier app version) once it's confirmed to hold nothing unique.

## What I need from you to start Phase 0

- **Confirmation to proceed** with creating a git branch and taking a Supabase database backup (both reversible, low-risk, but I want your go-ahead before touching anything outside this `audit/` folder).
- **Live Supabase project access** (or a willingness to run a couple of read-only SQL queries yourself and share the output) so ISS-049 can resolve whether the 5 missing tables and the `lead_stage` column are real schema drift or genuinely absent. This single piece of information determines the entire shape of Phase 3.
- Answers to the 4 decisions above, or permission to proceed with the roadmap's default recommendation for each.

## Literal first three actions once you give the go-ahead

1. Create branch `remediation/phase-0-audit-followup` from current `main` (or whatever your production branch is called), and tag the current state for an instant revert point.
2. Take a Supabase database backup and verify it's restorable.
3. Run the `information_schema` queries against the live database for the 5 missing tables/views and the `lead_stage` column (exact queries can be handed to you or run directly if given access) — this single step unblocks the two Critical database issues (ISS-009, ISS-010) and the biggest remaining unknown in the whole roadmap.

## After that

Proceed through `IMPLEMENTATION_ORDER.md` step by step. Each step lists its own prerequisites, verification, and rollback — nothing later in the list should start before its listed prerequisites are confirmed done.
