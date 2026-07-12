# IMPLEMENTATION_LOG.md

Chronological execution log. Every entry follows: Problem → Cause → Files Changed → Reason → Verification.

---

## 2026-07-11 — Phase 0: Safety Checkpoint

**Actions taken:**
- Verified `npx tsc --noEmit` on the untouched codebase: **0 errors** (clean baseline confirmed).
- Verified `node_modules` already installed (498 packages), Node v22.22.3, npm 10.9.8.
- Verified `.env.local` present with all expected variable names populated (values not read/logged).
- Created git branch `remediation/phase-0-audit-followup` from `main` at commit `b8f5d7a`.
- Created annotated tag `pre-remediation-baseline` on that same commit as an instant-revert point.

**Unexpected issue discovered (documented per the "stop, document, fix, continue" rule):**
- `git` operations that require writing to `.git/index.lock` (e.g. `git checkout <path>`) fail with `Operation not permitted` on this mounted filesystem — the lock file cannot be created/removed by this process, even though read-only git operations (`git show`, `git log`, `git diff` via process substitution with caveats) and some write operations (`git branch`, `git tag`) succeeded. **Practical impact: `git checkout -- <file>` cannot be used to restore a file in this environment.** Established workaround: use `git show HEAD:<path> > tempfile` (read-only, works) followed by `cp tempfile <path>` (works) instead of `git checkout`.
- Separately, `mv` (rename) across the mount can fail with `unable to remove target: Operation not permitted` when the destination already exists. **Workaround: use `cp <temp> <destination>` instead of `mv` for all file replacement operations for the remainder of this execution.**

**Verification:** TypeScript baseline (0 errors) reconfirmed after branch/tag creation — no files were touched by these git operations.

---

## 2026-07-11 — ISS-040: Remove invoice debug logging

**Problem:** `src/app/api/proposals/[id]/invoice/route.ts` contained 5 `console.log` statements (original lines 448-452) that dumped payment amounts, receipt numbers, and proposal IDs to production server logs on every invoice view.

**Cause:** Debug logging left in from development, never removed before shipping.

**Files changed:** `src/app/api/proposals/[id]/invoice/route.ts` (5 lines removed, nothing else).

**Reason:** Matches `MASTER_ISSUE_REGISTER.csv` ISS-040 exactly — sensitive financial data should never be written to plaintext logs.

**Unexpected issue discovered during this fix (stop, document, fix, continue):**
- The first attempt used the standard file-editing tool and resulted in the file being **truncated and corrupted** (509 lines → 504 lines of content followed by trailing NUL (`0x00`) bytes, ~500 bytes of null padding). TypeScript immediately caught this (`error TS1127: Invalid character` at the corrupted line). This appears to be a write-reliability issue specific to this Windows-host/Linux-sandbox mounted filesystem, not a logic error in the edit itself.
- **Stopped immediately**, did not proceed to any other file.
- **Fixed** by restoring the file from git (`git show HEAD:<path> > tempfile; cp tempfile <path>`), confirmed byte-for-byte identical to the git-tracked version (23,030 bytes, matches), then reapplied the exact same 5-line removal using `sed '448,452d' file > tempfile; cp tempfile file` instead of the file-editing tool.
- **Adopted going forward:** all remaining file modifications in this execution use the `sed`/`cat`-to-tempfile-then-`cp` pattern, with an immediate post-write byte-count and `tsc --noEmit` check, rather than relying on the standard editing tool alone. This is slower but has now been verified reliable twice (restore + re-fix) with zero corruption.

**Build:** N/A (Next.js dev/prod build was not run in full for this single-file change; `tsc --noEmit` is the faster, sufficient check for a pure logic-removal change with no type surface change).

**TypeScript:** ✅ 0 errors (`npx tsc --noEmit`).

**ESLint:** ✅ `npx next lint --file src/app/api/proposals/[id]/invoice/route.ts` — "No ESLint warnings or errors".

**Tests:** No test suite exists yet (ISS-031, next issue in queue). Manual verification only at this stage.

**Diff verification:** `diff` against the git HEAD version of the file confirms exactly the 5 debug lines were removed and nothing else changed.

**Functional verification performed:** Static-only (route was not exercised end-to-end against a live database in this step, since that requires either live Supabase network access — currently blocked from this sandbox, see NEXT_STEPS.md — or a running dev server with real credentials; deferred to the manual QA pass once auth/database work, Phases 2-3, makes the route safely testable end-to-end).

**Status:** ✅ COMPLETE.

---

## 2026-07-11 — ISS-031: Scaffold test framework

**Problem:** No automated testing of any kind existed in the project (no test runner, no config, no `test` script).

**Cause:** Never set up.

**Files changed:**
- `package.json` — added `"test": "vitest run"` script and `"vitest": "^1.6.0"` devDependency.
- `vitest.config.ts` — new file, Node environment, `src/**/*.test.ts` include pattern, `@/*` alias matching `tsconfig.json`.
- `src/lib/lead-scorer.test.ts` — new file, 11 tests covering `parseBudget` (lakh/lac/k notation, plain numbers, null handling) and `scoreLead` (HOT/COLD temperature thresholds, 0-100 clamping, temperature-tag dedup on rescoring, VIP tag preservation, malformed-input safety). Chosen because `lead-scorer.ts` is a pure function with no DB/network dependency — safe to test in isolation and exercises real, previously-unverified business logic (the "clamp" and "temperature tag dedup" behavior documented in the file's own comments).

**Reason:** Matches `MASTER_ISSUE_REGISTER.csv` ISS-031. Framework choice: Vitest (fast, native ESM/TS support, no extra Babel config needed, works standalone alongside Next.js without conflicting with `next lint`).

**Unexpected issue discovered during this fix (stop, document, fix, continue) — second occurrence of the known file-corruption issue:**
- `npm install -D vitest@1.6.0` initially timed out mid-install (45s bash call limit) on the first attempt, leaving a partial `node_modules/vitest` with no corresponding `package.json`/lockfile entry. Retried the same command in a fresh call — it completed successfully (npm reused/resumed from its local cache; some harmless `EPERM` cleanup warnings appeared removing unused optional platform binaries for `@rollup/rollup-*`, consistent with the mount's known rmdir permission restrictions, but did not affect the install outcome). Verified via `npx vitest --version`.
- Separately, using the standard Edit tool to add the `test` script and `vitest` devDependency to `package.json` **corrupted the file again** — this time truncating it entirely partway through the `devDependencies` block (file cut off mid-string after `"typ` with no closing braces at all, not trailing NUL bytes this time, but same root cause: unreliable writes to this file on this mount). Caught immediately via `python3 -c "json.load(...)"` failing with `JSONDecodeError` and `node -e "require('./package.json')"` failing with `ERR_INVALID_PACKAGE_CONFIG`, before any further work proceeded.
- **Fixed** using the established safe pattern: restored clean baseline via `git show HEAD:bookmyspaces/package.json > tempfile` (note: git root is `C:\rajubmp`, so the path is `bookmyspaces/package.json`, not `package.json` — this tripped the first restore attempt), verified valid JSON, applied both edits via `sed` on the tempfile, verified the parsed JSON had the correct `scripts.test` and `devDependencies.vitest` values, then `cp tempfile package.json` (not `mv`). Verified final file valid JSON, Node-parseable, and `diff` against git HEAD confirmed only the two intended lines changed.
- **Reinforces the standing rule adopted at ISS-040:** the Edit tool is not reliable for modifying already-tracked files on this mount, even for small string-replacement edits. All remaining file modifications in this execution continue to use the `sed`/`cat`-to-tempfile-then-`cp` bash pattern with mandatory post-write validation (JSON parse / `tsc --noEmit` as appropriate).

**Build:** Not run in full (`next build`); no application code was touched, only test tooling.

**TypeScript:** ✅ 0 errors (`npx tsc --noEmit`), full project.

**ESLint:** ✅ `npx next lint --file src/lib/lead-scorer.test.ts --quiet` — "No ESLint warnings or errors".

**Tests:** ✅ `npx vitest run` — 11/11 passed (`src/lib/lead-scorer.test.ts`).

**Functional verification performed:** `npm test` (via `package.json` script) now runs the suite end-to-end; confirmed working via direct `npx vitest run` invocation.

**Status:** ✅ COMPLETE.

---

## 2026-07-11 — Dead-code investigation: ISS-015, ISS-017, ISS-018

**Directive:** Per user's final decision, do not delete these modules immediately — determine whether each is a genuinely unfinished feature (complete/integrate/test) or conclusively obsolete (only then remove).

**ISS-017 (`src/modules/automation/escalation-engine.ts`, 121 lines):**
- Confirmed zero importers repo-wide (`grep -rn "escalation-engine" src`).
- Code review: fully implemented, well-structured escalation rule engine (6 rules: high-value, VIP, large corporate, stale hot lead, stale negotiation, unqualified high-scorer). Not a stub — genuinely finished logic.
- **New finding (not in original audit):** `applyEscalation()` writes `escalation_required` to the `leads` table. Grepped every migration file — `escalation_required` is added by migration 010 **only to the `proposals` table**, never to `leads`. Yet `src/app/api/leads/hot/route.ts` and `src/app/api/dashboard/stats/route.ts` already read `leads.escalation_required` from live queries (defensively, with `?? false` fallbacks), implying this column may already exist on the live `leads` table outside any migration — i.e. a 6th instance of schema drift, in addition to the 5 tables/1 column already flagged as ISS-009/ISS-010.
- **Conclusion:** Genuinely unfinished/unwired feature, per user's decision this should be completed and integrated (wire into the webhook path after lead scoring, per the file's own header comment). **Integration is blocked** until live DB access (task #26) confirms whether `leads.escalation_required` exists live or needs a new additive migration — writing to a possibly-nonexistent column would break the webhook in production.

**ISS-018 (`src/modules/followups/followup-engine.ts` 14 lines + `followup-rules.ts` 108 lines):**
- Confirmed zero importers repo-wide.
- Code review: `followup-rules.ts` is a complete, well-designed system — per-temperature cadence schedules (HOT/WARM/COLD) with distinct delay steps, trigger reasons, 10 real WhatsApp message templates, and exponential retry backoff. `followup-engine.ts` is a much smaller, inconsistent duplicate (different, conflicting cadence numbers for HOT: `[2,12,24]` vs. rules.ts's 5-step `[2,12,24,48,72]`) — looks like an early draft superseded by `followup-rules.ts`.
- **Cross-checked the live cron job** (`src/app/api/cron/followups/route.ts`, runs daily via `vercel.json`): it does NOT use either module. It reads a `follow_ups` table filtered by `status='pending', type='whatsapp'` and sends one generic template (`WHATSAPP_MESSAGES.followUp()`) with no temperature-based cadence or per-stage messaging.
- **Conclusion:** `followup-rules.ts` is genuinely unfinished, higher-quality work that was never wired into the live cron job — confirms the "unfinished feature" theory, not dead/obsolete code. `followup-engine.ts`'s single function (`getFollowUpCadence`) is superseded by `followup-rules.ts`'s `CADENCE_RULES` and should be removed once `followup-rules.ts` is integrated (that portion is "conclusively obsolete after verification" per the user's own stated bar). **Integration is blocked** on confirming the live `follow_ups` table's actual columns (does it support per-step `trigger_reason` tracking the way `followup-rules.ts` expects?) — same live-DB dependency as ISS-017.

**ISS-015 (secondary WhatsApp subsystem, 6 files ~1020 LOC) + ISS-043 (duplicate Meta API call):**
- Already thoroughly documented in `MASTER_ISSUE_REGISTER.csv` from the planning phase: a more sophisticated conversation state-machine (`conversation-manager.ts`, `auto-responder.ts`, `lead-resolver.ts`, `send-message.ts`, `detect-source.ts`, `process-inbound.ts`) was built to replace the simpler keyword-matching auto-reply that's actually live in `src/app/api/whatsapp/webhook/route.ts`, but was never wired in — and targets two tables (`whatsapp_messages`, `whatsapp_conversations`) that don't exist in any migration.
- **Conclusion:** Confirmed unfinished, not obsolete — same category as ISS-017/018. Largest of the three (Large effort per the register: needs new migrations for two tables, plus reconciling with the live simple auto-responder and the duplicate Meta Graph API call in ISS-043). **Also blocked** on live DB access to confirm those two tables don't already exist as drift before writing new migrations.

**Net result: all three dead-code items converge on the same blocker.** None will be deleted (per user decision, none are "conclusively obsolete" — quite the opposite, all three are more sophisticated than what's currently live). All three require live database schema confirmation before any integration code is written, to avoid either (a) writing to columns/tables that already exist under different assumptions, or (b) creating duplicate/conflicting migrations. This makes live Supabase access (task #26 — Supabase MCP connector suggested to user, awaiting connection) the single highest-priority unblock for all of: ISS-006 (RLS verification), ISS-009/ISS-010/ISS-049 (original schema drift), ISS-015, ISS-017, ISS-018.

**Files changed:** None — read-only investigation this round, per "verify before implementing" and to avoid writing schema-dependent code before the schema is confirmed.

**Status:** Investigation ✅ COMPLETE for all three. Integration ⏸ BLOCKED on live DB access.

---

## 2026-07-11 — Live database reconciliation

**Directive:** User instructed live DB as source of truth for all further work; Supabase MCP connector could not be established (confirmed via `list_connectors`/`search_mcp_registry`, both showed `connected: false`), so a comprehensive read-only SQL snapshot query was provided instead and run by the user in the Supabase SQL Editor.

**Findings:** Full reconciliation against all 9 migration files and the application code, documented in `LIVE_SCHEMA_AUDIT.md`, `SCHEMA_DRIFT_REPORT.md`, `DATABASE_RECONCILIATION.md`. Headline: drift is much larger than the original audit estimated — 10 live tables and 3 live views exist in no migration file (likely the missing migration `009`, ISS-011), 8 migration-defined tables were never applied live, `leads.escalation_required`/`lead_stage`/`owner_id` and 6 other columns exist live but in no migration, 4 anon RLS policies that migrations still define are already absent live (ISS-008 already fixed in production, migration files just don't reflect it), and 2 tables (`analytics_events`, `follow_ups`) have RLS enabled with zero policies (a blocker for ISS-006). Also confirmed: the ISS-015 WhatsApp subsystem's target tables (`whatsapp_conversations`, `whatsapp_messages`) already exist live, fully built — re-scoping that issue from Large to Medium effort. `notification_settings` (ISS-007's subject) doesn't exist live at all — closed as superseded by the already-secure live `notifications` table.

**Files changed:** `supabase/migrations/009_document_undocumented_production_objects.sql` (new) — additive, idempotent migration documenting the 10 undocumented tables, 9 leads columns, 3 views, and fixing the ISS-006/ISS-008 RLS gaps, written verbatim from live column/constraint/index data. Deliberately does **not** include `CREATE OR REPLACE FUNCTION` for 4 live functions whose source wasn't captured by the snapshot query (only name + return type) — fabricating function bodies for working production functions was judged too risky; a follow-up `pg_get_functiondef` query is documented in the migration's header comment for whoever wants to version-control those next.

**Verification:** File integrity checked (byte count, tail bytes, null-byte scan, balanced parens) after writing — clean. **Not yet applied to the live database** — this repo has no live DB write path (network blocked, connector not connected), so the migration is provided to the user to run via Supabase SQL Editor, same pattern as the schema snapshot query.

**Status:** Reconciliation ✅ COMPLETE. Migration drafted, ⏸ awaiting user to run it live before ISS-006/015/017/018 application code changes proceed (those all depend on this schema state).

---

## 2026-07-11 — Independent self-review of migration 009

**Directive:** User required a full line-by-line self-review of the drafted migration, treating it as if from another engineer, before running it against production.

**Findings — 3 real issues caught and fixed:**
1. Migration had declared `user_profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` — an unverified assumption (common Supabase convention) that directly contradicted my own `SCHEMA_DRIFT_REPORT.md`, which explicitly lists this FK as absent from the live data. Removed the fabricated FK.
2. Migration had an inline `CHECK` constraint attached to `ADD COLUMN IF NOT EXISTS source_channel` on `leads`, where that column (and an identically-named constraint) already exists live — an ambiguous PostgreSQL edge case. Replaced with a guarded `DO $$ ... IF NOT EXISTS (pg_constraint lookup) ... $$` block.
3. Migration had no `BEGIN`/`COMMIT` wrapper, meaning a mid-script failure could leave production partially migrated. Added a full transaction wrapper (safe since all DDL used is transactional in PostgreSQL).

**Unexpected issue discovered during this fix — third occurrence of the file-corruption bug, and a new data point on its cause:** Using the Edit tool to add the `BEGIN;`/`COMMIT;` lines corrupted the file again — this time the **Write tool's rewrite attempt also silently truncated at the exact same byte count (19,656 bytes)** as the prior Edit-tool corruption, even though the new content was ~3KB longer. This is a new finding: the corruption is not limited to the Edit tool's diffing logic — it appears to be a hard truncation ceiling around ~19.6KB on this specific mounted filesystem, affecting the Write tool too at that size. **Fixed** using the established safe pattern (bash heredoc to `/tmp`, verified there, then `cp` to destination) — this produced the full, correct 22,668-byte file, verified via byte count, null-byte scan, balanced-parentheses check, single-quote balance (excluding comment apostrophes), and `sqlparse` statement parsing (95 statements, only the expected `DO $$` block flagged as an expected parser-limitation false positive, not a real error).

**Adopted going forward:** any file write exceeding roughly 15-18KB should use the bash heredoc-to-tempfile-then-`cp` pattern directly, rather than the Write or Edit tools, given this is now a confirmed, reproducible size-based failure mode on this mount (not just an Edit-specific issue as previously believed).

**Files changed:** `supabase/migrations/009_document_undocumented_production_objects.sql` (revised — 3 fixes above), `audit/MIGRATION_REVIEW.md` (new — full statement-by-statement classification, all statements now SAFE).

**Status:** ✅ COMPLETE. Migration re-verified safe, all statements classified SAFE, awaiting user to run it (task #32, unchanged).

---

## 2026-07-11 — Environment note: git access restored, CRLF false alarm

**Issue:** This session's connected folder initially covered only `bookmyspaces/`, not the git root at `C:\rajubmp`. No git commands worked at all (not a permissions issue this time — the directory simply isn't a repo from that mount point). Connected `C:\rajubmp` as an additional folder; git access (branch, tags, log, history) is now available and confirmed intact, matching everything `CURRENT_STATUS.md` claimed (branch `remediation/phase-0-audit-followup`, tag `pre-remediation-baseline`, commit `b8f5d7a`).

**False alarm ruled out:** `git status`/`git diff --stat` initially showed 52 files "changed" with ~19,500 lines of churn — looked like major unlogged drift. `git diff -w` (ignore whitespace) showed only 3 real files differ from HEAD: `package.json`, `package-lock.json` (both ISS-031), and the invoice route (ISS-040) — exactly matching the log. The other 49 files differ only in line endings (LF→CRLF), consistent with the known Windows-mount write-reliability quirk already documented above. No action taken; noting to always diff with `-w` going forward on this mount.

**Status:** ✅ Environment restored, no actual drift found.

---

## 2026-07-11 — ISS-025: Stray root files reviewed and classified

**Problem:** `git`, `npm`, `latest.json`, `logs.json`, `logs.txt`, `all_routes.txt`, `deployed_route.txt`, `deployment-trigger.txt` were flagged in the original audit as unverified-content stray files, with an explicit instruction to review before any cleanup phase touches them, since RISK_REGISTER.md says a positive finding here escalates to a Critical, out-of-band track.

**Findings:**
- `git`, `npm` — 0 bytes, confirmed empty. Harmless (likely an accidental `> git`/`> npm` shell redirect at some point). Left in place (deletion via `rm` on this mount returns `Operation not permitted`; not worth forcing for two empty files — folded into the Phase 4 backlog, non-urgent).
- `deployment-trigger.txt` — trivial Vercel redeploy-trigger content (`deployment-trigger` / `reconnect-test`). Harmless.
- `all_routes.txt` — 3,054-line dump of API route source code used for a past recon pass. Grepped for secret patterns (`SUPABASE_SERVICE_ROLE_KEY=`, `sk-...`, `eyJ...` JWT-shaped strings, etc.) — zero matches. No secrets. Just source code, already committed; harmless but is genuine clutter (ISS-013/ISS-024-adjacent, not urgent).
- `deployed_route.txt`, `logs.txt` — 0 bytes in the working tree.
- **`latest.json` and `logs.json` — NOT harmless.** These are real Vercel log-export dumps containing: a live customer's full name, unmasked phone numbers (appearing in multiple log lines), private WhatsApp message content, and a truncated WhatsApp API token prefix (`EAAZB65Ruc...`, insufficient alone to reconstruct the full secret — confirmed no full token/key pattern present anywhere in either file).
- **Escalation trigger confirmed:** `git log --all -- <file>` showed all of these files were committed in commit `43b6a15` ("Pre Phase 2 foundation migration backup") on `main`, which has a GitHub `origin` remote (`github.com/raju1605jobs-hash/bookmyspaces-crm-v2.git`). Per `RISK_REGISTER.md`'s own rule, committed PII escalates this from "routine Phase 4 cleanup" to a Critical, out-of-band remediation.

**Decision (user, explicit):** Purge the PII-bearing files from git history entirely (not just going forward), on top of removing them from the working tree.

**Action taken:**
1. Full safety backup first: `git bundle create` of the original (pre-rewrite) repo, all 32 refs, verified restorable — saved to the outputs folder as `rajubmp-full-repo-backup-pre-history-rewrite.bundle`.
2. Scoped the blast radius before touching anything: only 2 commits (`43b6a15`, `b8f5d7a`) and 2 refs (`main`, `remediation/phase-0-audit-followup`, plus their `origin/*` counterparts) and 2 tags (`pre-phase2-foundation`, `pre-remediation-baseline`) ever contained these files. The other 6 local branches and 13 other tags never touched them (verified via `git log <ref> -- <paths>` per ref) — a much smaller blast radius than "rewrite everything."
3. `git-filter-repo` (installed via pip) attempted directly on the mounted repo first — hit a stale `.git/filter-repo/already_ran` marker from a **prior, unrelated run dated May 11** (predates this remediation entirely) which could not be removed (`Operation not permitted`, same mount-permission issue as the index.lock problem noted in Phase 0). Rather than fight the mount, cloned the repo fresh from the verified-good bundle into a plain (non-Windows-mounted) `/tmp` location, reconstructed all 9 branches and 15 tags there, and ran the rewrite cleanly.
4. `git-filter-repo --path bookmyspaces/latest.json --path bookmyspaces/logs.json --path bookmyspaces/logs.txt --path bookmyspaces/deployed_route.txt --invert-paths --force` — completed in under 1 second (small repo, 118 commits).
5. **Verification:** `git log --all -- <4 paths>` on the rewritten repo returns zero commits (fully purged, every branch and tag). All 15 tags and 9 branches still present. The one unaffected branch checked (`stable-phase1`) has an **identical** commit hash before/after (`024cd1c8...`), confirming the rewrite only touched what it should have. `main`/`remediation/phase-0-audit-followup` both moved from `b8f5d7a` to `ef9a3a4b` (new, PII-free tree, same file content otherwise).
6. Rewritten, verified-clean repo bundled to the outputs folder as `rajubmp-history-rewritten-CLEAN.bundle` for handoff.
7. Working tree cleanup on the live mounted repo: `latest.json` and `logs.json` emptied (0 bytes) via the file-editing tool (direct `rm` fails with `Operation not permitted` on this mount, same as other delete/rename ops noted in Phase 0/ISS-040/ISS-031). `.gitignore` updated with explicit entries for `latest.json`, `logs.json`, `logs.txt`, `deployed_route.txt` so they can't silently reappear and get re-committed.

**What could NOT be done from this sandbox:** Pushing the rewritten history to `origin`. `git push origin main --dry-run` fails with `fatal: could not read Username for 'https://github.com'` — no GitHub credentials are available in this environment (this sandbox's network can actually reach github.com, unlike Supabase, but has no push auth configured). **This is a genuine external-credential stop condition** — completing this fix requires the user to run the handoff steps below from a machine with their own GitHub push access.

**Handoff steps for the user (exact commands):**
```
# On a machine with GitHub push access to raju1605jobs-hash/bookmyspaces-crm-v2:
git clone rajubmp-history-rewritten-CLEAN.bundle rajubmp-rewritten
cd rajubmp-rewritten
git remote add origin https://github.com/raju1605jobs-hash/bookmyspaces-crm-v2.git
git push origin --force --all
git push origin --force --tags
# Then, on every other existing local clone/collaborator machine:
#   re-clone the repo fresh, or run: git fetch origin && git reset --hard origin/<branch>
#   (old local copies still have the pre-rewrite commits until they do this)
```

**Rollback:** `rajubmp-full-repo-backup-pre-history-rewrite.bundle` (also in the outputs folder) is the complete, verified pre-rewrite state if this needs to be undone.

**Status:** ✅ Local rewrite COMPLETE and verified. ⏸ Push to origin BLOCKED on user's own GitHub credentials (external-credential stop condition, not a code/logic gap).

---

## 2026-07-11 — Critical process note: Edit tool silently truncated 8 files this session

**Problem:** After completing ISS-020, ISS-032, ISS-042, and ISS-047 using the Edit tool (not the previously-adopted bash heredoc/`sed`-to-tempfile-then-`cp` pattern), a routine `npx tsc --noEmit` check caught 5 files with syntax errors. Investigation with `python3`/`wc -c`/`tail -c` (bypassing the file-reading tool, which was showing stale/cached-looking "success" content) confirmed **every single file touched with the Edit tool this session was silently truncated mid-content on disk** — including two live, in-production route files (`src/app/api/proposals/email/route.ts` and `src/app/api/whatsapp/webhook/route.ts`, both left with unclosed braces), two dead files being annotated (`lead-stage-route.ts`, `api--proposal--share--token--route.ts`), `tailwind.config.ts`, `.gitignore`, and — most seriously — this very log file and `CHANGELOG.md`, both cut off mid-sentence, silently destroying previously-recorded history (the entire "Dead-code investigation," "Live database reconciliation," and "Independent self-review of migration 009" sections above had to be reconstructed from this session's own read-back of the file taken before the corruption occurred).

**Cause:** This is the exact bug already documented above (ISS-040, ISS-031, migration-009 review entries) — this mounted filesystem's Edit/Write tool writes are not reliable — but this session did not consistently apply the already-adopted heredoc/tempfile/`cp` workaround to every edit, and trusted the tool's own "file state is current in your context" success message instead of independently re-verifying byte counts after each write. The two files created via a fresh `Write` call (new `route.ts` files for ISS-020) were **not** corrupted — only files modified via the incremental `Edit` tool were affected in this session, consistent with the pattern already seen before.

**Fix:** Reconstructed all 8 affected files via the bash heredoc-to-`/tmp`-then-`cp` pattern (quoted heredoc delimiter to avoid shell interpolation of `` ` ``/`$`/`₹` characters), verifying byte count and a `tail -c` content check immediately after every write, then re-ran `npx tsc --noEmit` for the code files (0 errors after the fix) and manually reviewed the two markdown files end-to-end against what was actually intended.

**Adopted going forward, reinforced without exception:** every file write in this environment — Edit or Write, any file type, any size — is followed immediately by an independent byte-count + tail-content check via `wc -c`/`tail -c` in the shell tool, never trusting the editing tool's own success message alone. For anything beyond a trivial one-line change, use the heredoc-to-tempfile-then-`cp` pattern directly rather than the Edit tool.

**Status:** ✅ COMPLETE. All 8 files reconstructed and verified; `tsc --noEmit` clean.

---

*(Log continues below as each subsequent issue is implemented.)*

---

## 2026-07-11 — Follow-up: PII files were null-padded, not truly emptied

**Problem:** The file-editing tool's "empty content" write to `latest.json`/`logs.json` (in the ISS-025 fix above) did not truncate the files — it kept their original byte lengths (8040 / 10982 bytes) but filled them entirely with NUL (`0x00`) bytes instead of shrinking to 0 bytes. Caught via an independent `python3` byte-level check (`set(data) == {0}`) after noticing `git diff --stat` reported these two files as unchanged-size binary diffs, which didn't match "emptied."

**Fix:** Used a plain bash truncation (`: > latest.json`, `: > logs.json`) instead of the file-editing tool — this correctly truncated both files to genuine 0 bytes, confirmed via `wc -c`.

**Reinforces:** the file-editing tool on this mount cannot be trusted even for "make this file empty" — bash-level operations (`:  > file`, heredoc-to-tempfile-then-`cp`) are the only verified-reliable write path found this session. No PII was actually reachable at any point during the null-byte-padded intermediate state (0x00 bytes aren't readable text), so this was a cleanliness/correctness issue, not a re-exposure risk.

**Status:** ✅ COMPLETE. Both files verified genuinely 0 bytes.

## ISS-002 batch 2 & batch 3: auth rollout completed (proposals + whatsapp/campaigns/misc)

**Problem:** ISS-002 — most API routes had no session/auth check at all (service-role Supabase client used directly, reachable by anyone who found the URL).

**Files changed (batch 2, proposals):**
- `src/app/api/proposals/[id]/invoice/route.ts`, `[id]/receipt/route.ts`, `[id]/payment/route.ts`, `route.ts` (GET/POST/PATCH/PUT), `intelligence/route.ts` (GET/POST/PATCH), `email/route.ts` (POST) — all now call `requireAuth()` and return `auth.response` (401) if not logged in.
- Confirmed and left public (traced actual callers, not just assumed): `proposals/[id]/pdf`, `proposals/[id]/preview` (both linked directly from the public customer-facing share page `src/app/(crm)/proposals/share/[token]/page.tsx`), `proposals/track-view` (designated public in original audit Phase 2 notes).

**Files changed (batch 3, whatsapp/campaigns/misc):**
- `src/app/api/whatsapp/campaigns/route.ts` (GET/POST), `whatsapp/send/route.ts` (POST), `campaigns/route.ts` (GET/POST/PATCH), `conversations/route.ts` (GET), `followups/route.ts` (GET/POST), `knowledge/route.ts` (GET/POST/DELETE), `leads/[id]/stage/route.ts` (PATCH) — all now call `requireAuth()`.
- Left public, confirmed by reading route source: `src/app/api/chat/route.ts` (POST/GET) — this is the anonymous-visitor-facing AI chatbot widget used for lead capture on the public website; it has no user session by design and must stay open.
- Left alone (out of scope): `src/app/api/ai-summary/route.ts` — this is the ISS-016 stub (18 lines, no DB client, returns static JSON). Not wired to real logic yet per ISS-016 (blocked on `ai_summaries` table not being live — see OPEN_ISSUES.md). Adding auth to a non-functional stub was judged not worth doing ahead of ISS-016 itself.

**Reason:** Direct instruction from user ("Yes, implement it now") to complete Phase 2 authentication rollout across all routes.

**Incident during this batch:** `src/app/api/leads/[id]/stage/route.ts` was corrupted mid-edit by the Edit tool again (truncated after `const msg` inside the catch block, `tsc` caught it immediately as `'}' expected`). Recovered the missing tail from the superseded sibling file `lead-stage-route.ts` in the same folder (byte-for-byte source of the original route before the ISS-020 rename), reconstructed the full file via the heredoc-to-/tmp-then-cp pattern, and re-verified with `wc -c`/`tail -c`. This is now the second time this exact class of corruption has hit a file in this session — the verify-every-write discipline caught it both times before it could reach a commit.

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean, only a pre-existing unrelated `<img>` warning in `UserMenu.tsx`), `npx vitest run` (11/11 passing), byte-count/tail verification on every touched file.

**Cross-check against `audit/routes.csv`:** every route originally marked `auth_check: NO` is now either protected (`requireAuth()` added) or confirmed intentionally public with a documented reason above. `whatsapp/webhook` remains `PARTIAL` — that's correct, it verifies Meta's HMAC signature (ISS-004) rather than a user session, since it's called by Meta's servers, not a logged-in staff member.

---

## ISS-027/ISS-028: Consolidated the two divergent OAuth callback implementations

**Problem:** `src/app/api/auth/callback/route.ts` and `src/app/auth/callback/route.ts` were two independent, hand-written implementations of the same Supabase code-exchange flow: different redirect-param names (`redirect` vs `next`), different cookie-handling code (one reused `supabase-server.ts`, the other reimplemented `createServerClient` inline), and different failure targets — one of which (`/auth/auth-code-error`) doesn't exist anywhere in the app (confirmed via `find src/app/auth`), so a failed magic-link/OAuth exchange 404'd (ISS-028).

**Decision:** Rather than deleting either route (no visibility into which URL is configured in the live Supabase project's redirect-URL allowlist or email templates from this sandbox — deleting the wrong one would silently break real sign-in links), both files now delegate to one new shared function, `src/lib/auth-callback.ts` (`handleAuthCallback`). Both URL paths stay live and now behave identically: accept either `?redirect=` or `?next=`, use the shared cookie-aware `createServerAuthClient()`, and on failure redirect to `/auth/login?error=callback_failed` instead of the missing page.

**Files changed:**
- `src/lib/auth-callback.ts` (new) — the single shared implementation.
- `src/app/api/auth/callback/route.ts`, `src/app/auth/callback/route.ts` — both reduced to `export { handleAuthCallback as GET } from '@/lib/auth-callback'`.
- `src/app/auth/login/page.tsx` — now reads `?error=callback_failed` and shows a real message ("Your sign-in link expired or was already used...") instead of silently ignoring the query param, which is what ISS-028's "missing error-state UX" was actually asking for beyond just not-404ing.

**Incident during this fix:** the Edit tool truncated `login/page.tsx` mid-JSX again (cut off after "Forgot your password? Cont", `tsc` immediately caught 5 `TS17008`/`TS1005` errors). Full original content was already in context from the Read done just before the edit, so it was reconstructed via the heredoc-to-/tmp-then-cp pattern with the new error-handling lines merged in, then re-verified byte-for-byte.

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean, same pre-existing unrelated warning), `npx vitest run` (11/11 passing).

---

## ISS-017: Wired the escalation engine into a new scheduled cron route

**Problem:** `src/modules/automation/escalation-engine.ts` (`evaluateEscalation`/`applyEscalation`) was fully written and correct but never called from anywhere — leads never actually got escalated in practice. The register flagged this as blocked pending a product decision on the trigger point (inline on lead update, inline in webhooks, or scheduled cron).

**Decision (from user, explicit):** Scheduled job (cron), matching the existing `/api/cron/followups` pattern rather than adding it inline to webhook handlers.

**Files changed:**
- `src/app/api/cron/escalations/route.ts` (new) — GET handler guarded by the same `CRON_SECRET` bearer-token check as `cron/followups`. Selects leads where `escalation_required = false` and `lead_stage` is not in a terminal state (`CONFIRMED`, `LOST`), runs `applyEscalation()` on each (up to 200 per run), returns `{ processed, escalated }`.
- `vercel.json` — registered the new route in `functions` (30s maxDuration) and added a `crons` entry: `/api/cron/escalations` on `0 */6 * * *` (every 6 hours — escalation is a "is this lead going stale" check, doesn't need to run as often as the once-daily follow-up sender).

**Incident during this fix:** `vercel.json` was truncated mid-edit by the Edit tool a third time this session (`json.load` failed with `Unterminated string` at the point the file cut off). Reconstructed the full file via the heredoc-to-/tmp-then-cp pattern (content was already known/unchanged apart from the two additions), validated with `python3 -c "import json; json.load(...)"` in addition to the usual `wc -c`/`tail -c` checks.

**Fields selected verified against schema:** `escalation_required` confirmed live on `leads` per `SCHEMA_DRIFT_REPORT.md` line 25 (added defensively outside its origin migration, already read by `leads/hot` and `dashboard/stats`). The remaining fields (`ai_score`, `estimated_revenue`, `tags`, `event_type`, `guest_count`, `lead_temperature`, `last_contacted_at`, `lead_stage`) are original/early-migration columns already used identically elsewhere in the codebase (lead scorer, hot-leads route).

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean, same pre-existing unrelated warning), `npx vitest run` (11/11 passing), `vercel.json` re-validated as parseable JSON after reconstruction.

---

## ISS-034 (partial), ISS-037, ISS-038, ISS-029: security headers + env var cleanup

**ISS-034 (partial — safe subset only):** Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy` to every route in `next.config.js`. Deliberately did NOT add a Content-Security-Policy header — the audit itself flags CSP as needing a full manual click-through test in a real browser before shipping (it can silently break inline scripts/styles/third-party embeds if mistuned), which isn't possible from this sandbox. Verified via `tsc`/`next lint`/`vitest`/two full `npm run build` runs by the user, both "Compiled successfully."

**ISS-037 (real bug, not just docs):** Found that `src/app/api/auth/logout/route.ts` read `process.env.NEXT_PUBLIC_SITE_URL`, a variable name that doesn't exist anywhere in `.env.example` and — confirmed by checking the real `.env.local` — is NOT set in production either. That means every logout redirect was silently falling back to `http://localhost:3000` instead of the real site. Fixed by switching that file to read `NEXT_PUBLIC_APP_URL` instead, the name every other file (e.g. `proposals/email/route.ts`) already uses and the one actually documented/set. This is a real functional fix, not just a naming cleanup.

**ISS-038/ISS-029:** Removed `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WATI_VERIFY_TOKEN`, `WATI_WEBHOOK_SECRET`, `NEXT_PUBLIC_BUSINESS_PHONE` from `.env.example` — confirmed via project-wide grep (`.ts`/`.tsx`/`.js`/`.jsx`) that none of these are read anywhere in the code. Kept `WATI_BASE_URL`/`WATI_API_TOKEN` documented (with a note on scope) since those two ARE still read, by `src/app/api/health/route.ts` and `src/lib/transcription.ts`.

**Files changed:** `next.config.js`, `src/app/api/auth/logout/route.ts`, `.env.example`.

**Incident:** `next.config.js` and `src/app/api/auth/logout/route.ts` were both truncated mid-edit by the Edit tool again (same recurring bug), caught immediately (`next build` failed to even load the config; `tsc` would have caught the route file). Both reconstructed via the heredoc-to-/tmp-then-cp pattern and re-verified.

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean, same pre-existing warning), `npx vitest run` (11/11 passing), two full `npm run build` runs on the user's own machine — both "Compiled successfully" with all routes listed.

**Not yet done:** ISS-036 (fully centralized env var startup validation, i.e. one file that checks all required vars are set and fails fast with a clear message) — this session only fixed the mismatch/dead-var issues (ISS-037/038/029); building a proper centralized validator is a slightly bigger, separate piece of work still on the list.

---

## NEW FINDING (via manual click-through, not in original audit register): missing sign-out button

**Problem:** While manually testing the Phase 2 authentication changes (login/logout) in a real browser at the user's request, discovered there was no way to log out of the CRM at all. `src/app/(crm)/layout.tsx` uses `CRMLayout.tsx`, a bare-bones sidebar layout with no header and no sign-out control anywhere. A second, more polished layout component, `CRMShell.tsx`, does have a "Sign out" button — but it is never imported/used anywhere in the app (dead code), and even if it were wired in, its sign-out button posts to `/api/auth/signout`, a URL that doesn't exist (the real, working route is `/api/auth/logout`, confirmed and fixed for ISS-037 earlier this session).

**Fix:** Added a working "Sign out" button directly to `CRMLayout.tsx` (the layout actually in use), as a simple form posting to the real `/api/auth/logout` route. Chose this over swapping in `CRMShell.tsx` wholesale, to avoid a much larger visual/behavioral change to every page in the app from a single small bug fix. `CRMShell.tsx` and the unused `login`/`logout` server actions in `src/app/actions/auth.ts` (which redirect to `/login` and `/error`, neither of which exist) remain as known dead code for a future cleanup pass — not touched in this fix to keep the change small.

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean, same pre-existing warning), `npx vitest run` (11/11 passing), `npm run build` on the user's machine (twice — before and after a dev-server restart needed to pick up the change), and a full manual browser test by the user: logged in with real Supabase credentials, clicked the new "Sign out" button, confirmed it correctly lands back on the login page.

**Why this matters beyond the immediate fix:** this is exactly the kind of bug that `tsc`/`lint`/`vitest`/`next build` cannot catch — nothing was type-incorrect or untested at the unit level, the button simply didn't exist in the UI a real user sees. This validates the manual click-through step the audit called for after the Phase 2 auth changes, and it found a real, previously-undocumented issue.

**Files changed:** `src/components/layout/CRMLayout.tsx`.

---

## Migration 009 applied to production by the user

**What happened:** The user ran `supabase/migrations/009_document_undocumented_production_objects.sql` directly in the Supabase SQL Editor (Authentication/database dashboard, not from this sandbox — no live DB network access here). Result: "Success. No rows returned" — the expected, correct result for a migration made entirely of DDL statements (CREATE TABLE/INDEX/POLICY, ALTER TABLE, CREATE OR REPLACE VIEW), with no errors.

**What this unblocks:** Per CURRENT_STATUS.md, this was the last remaining blocker for ISS-006 (RLS policies now exist on `analytics_events`/`follow_ups`, previously RLS-enabled with zero policies), ISS-009/ISS-010 (schema now documented in version control matching live), ISS-015/ISS-018 (the WhatsApp subsystem and follow-up engine both needed schema pieces this migration adds — `follow_ups.trigger_reason` in particular for ISS-018).

**Not yet done:** the 4 database functions this migration's triggers depend on (`assign_invoice_number`, `assign_receipt_number`, `sync_proposal_payment_status`, `update_updated_at`) were deliberately NOT redefined in migration 009 (see the migration's own header comment) — they already exist live and were left untouched rather than guessed at. A follow-up migration to capture their real source into version control is still open, low-priority (production is unaffected either way — the functions already exist and work).

---

## New feature: real email sending system (ISS-041 fix + proposal/invoice/payment/follow-up/booking-confirmation emails)

**Requested by user:** after prioritizing "proper proposal and WhatsApp integration, and running campaigns," the user asked specifically to replace the mailto:-only proposal email (ISS-041) with real server-side sending, provider-agnostic, with reusable templates, delivery logging, and support for 5 email types: proposal, invoice, payment reminder, follow-up, booking confirmation. Chose Resend as the provider after asking the user directly (options offered: Resend, SendGrid, existing business SMTP, or "pick one for me" — user chose Resend).

**Architecture (new files):**
- `supabase/migrations/011_email_log.sql` (new) — additive migration, one new table `email_log` (recipient, subject, template_type, related_entity_type/id, provider, provider_message_id, status, error_message, metadata, sent_at) with indexes and a service-role-only RLS policy, matching the project's existing convention. User still needs to run this in the Supabase SQL Editor (see below).
- `src/lib/email/provider.ts` (new) — `sendEmail()` talks to Resend's REST API via plain `fetch` (no new npm dependency). Deliberately provider-agnostic: nothing outside this file knows it's Resend specifically, so swapping providers later is a one-function change. `isEmailProviderConfigured()` checks `RESEND_API_KEY`.
- `src/lib/email/templates.ts` (new) — 5 pure functions (`proposalEmail`, `invoiceEmail`, `paymentReminderEmail`, `followUpEmail`, `bookingConfirmationEmail`), each returning `{ subject, html, text }`. Shared HTML wrapper for consistent branding. No DB or network calls — easy to unit test later.
- `src/lib/email/send.ts` (new) — `sendProposalEmail`/`sendInvoiceEmail`/`sendPaymentReminderEmail`/`sendFollowUpEmail`/`sendBookingConfirmationEmail`. Each renders the template, calls the provider, and **always** logs the attempt (success or failure) to `email_log` — this is the one place that guarantees logging, so no caller can forget it (learned from the ISS-042 unawaited-write incident earlier this session — this write is awaited).

**Routes wired up:**
- `src/app/api/proposals/email/route.ts` — rewritten to call `sendProposalEmail()` for real. If `RESEND_API_KEY` isn't set, falls back to the exact same mailto: behavior as before (graceful degradation, matches the `WHATSAPP_APP_SECRET` fail-open pattern already used elsewhere), so the button never just breaks.
- `src/app/api/proposals/[id]/invoice/email/route.ts` (new) — sends an invoice-summary email; separate from the existing `.../invoice/route.ts`, which only renders an invoice page/PDF for staff.
- `src/app/api/proposals/[id]/payment-reminder/route.ts` (new) — computes outstanding balance from `proposal.total_price` minus payments received so far (works even if no `invoices` row exists yet), refuses to send if balance is already zero.
- `src/app/api/proposals/[id]/booking-confirmation/route.ts` (new) — for once a proposal is confirmed.
- `src/app/api/leads/[id]/follow-up-email/route.ts` (new) — email channel for lead follow-ups, alongside the existing WhatsApp follow-up system (not merged into it, to avoid touching the working scheduled WhatsApp cron logic).
- All 4 new routes require `requireAuth()` (staff-only), matching the ISS-002 pattern used everywhere else in the app.

**`.env.example`:** documented `RESEND_API_KEY` and `EMAIL_FROM` with setup notes.

**Incident:** `.env.example` was truncated mid-edit by the Edit tool again (cut off mid-way through a multi-byte UTF-8 box-drawing character, `tail -c` showed a replacement-character `�`). Reconstructed via the heredoc-to-/tmp-then-cp pattern and re-verified byte-for-byte; all other new files in this feature were written directly via heredoc from the start and had no corruption.

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean, same pre-existing warning), `npx vitest run` (11/11 passing). Full `npm run build` and a live send test still pending — user needs to (1) run migration 011 in Supabase, (2) sign up for Resend and get an API key, (3) add `RESEND_API_KEY`/`EMAIL_FROM` to `.env.local`, (4) restart the dev server and test.

**Deliberately not done:** did not touch `src/app/api/whatsapp/campaigns/route.ts` or the broader WhatsApp campaign system in this pass — the user's WhatsApp priority is being handled separately (checking Meta template approval status), and this pass was scoped tightly to "real proposal emails" per the user's explicit requirements list.

---

## Found and fixed: "Email" button on Proposals page never called the real send logic

**Problem:** While preparing to test the new email system, discovered `src/app/(crm)/proposals/page.tsx`'s "Email" button (`handleAction`'s `send_via_email` branch) never called `/api/proposals/email` at all — it did its own separate `window.open('mailto:...')` directly in the browser. This is a third, independent implementation of "send proposal by email," completely bypassing both the old and new backend logic. This explains why ISS-041 was framed as "silently depends on a human opening... mailto_url" — the UI wasn't even using the route that returns that URL.

**Fix:** Added `handleSendEmail()` in the page component, which calls `POST /api/proposals/email` for real, and only falls back to opening a mailto: link if the backend reports `method: 'mailto'` (no provider configured). `handleAction`'s `send_via_email` branch now calls this instead of the old inline mailto.

**Incident:** the Edit tool truncated this file mid-way through the "Cards" render section on the first attempt (file is ~60KB, one of the largest files touched this session). Reconstructed the entire file via the heredoc-to-/tmp-then-cp pattern in two parts (concatenated), verified brace-balance with a small Node script in addition to the usual byte-count/tail checks, then re-verified byte-for-byte against the destination.

**Verification:** `npx tsc --noEmit` (clean), `npx next lint` (clean), `npx vitest run` (11/11 passing).

---

## 2026-07-12 — Fixed: "Unauthorized — please log in" blocking every protected API route

**Problem:** After the email system was built and configured, live testing of "Create Proposal" failed every time with `401 Unauthorized — please log in`, despite the user being genuinely logged in (confirmed reproducible in two different browsers, and NOT fixed by an earlier middleware session-refresh patch).

**Cause:** `src/lib/supabase-server.ts` (used by `getCurrentUser()` → `requireAuth()`/`requireRole()`, the gate on ~25+ API routes across the whole ISS-002 rollout) configured its Supabase client's cookie handling using a `{ getAll, setAll }` interface. The installed package, `@supabase/ssr@^0.3.0` (confirmed via `package.json` and `node_modules/@supabase/ssr/dist/index.d.ts`), only defines `CookieMethods` as `{ get?, set?, remove? }` in this version — there is no `getAll`/`setAll` support at all. Because the library never calls the methods that were actually provided, `supabase.auth.getUser()` inside every protected Route Handler silently never read the session cookie, so `requireAuth()` always rejected regardless of real login state. Page-level auth (via `src/middleware.ts`) was unaffected because `src/lib/supabase-middleware.ts` already used the correct, matching `get`/`set`/`remove` interface — which is why navigating between pages worked fine while every API POST/PATCH failed.

**Impact:** This bug affected every API route protected by `requireAuth()`/`requireRole()` since ISS-002 was first rolled out (batches 1-3, ~25+ routes) — not just proposal creation. It had gone unnoticed until now because this was the first live, authenticated API write tested end-to-end in the browser.

**Fix:** Rewrote `createSupabaseServerClient()` in `src/lib/supabase-server.ts` to use the same `get`/`set`/`remove` cookie interface already proven to work in `supabase-middleware.ts`, backed by `next/headers`'s `cookies()`.

**Verification:** `npx tsc --noEmit` (clean). Live-tested by the user: proposal creation now succeeds (`POST /api/proposals` → 201), confirmed via the Proposals list growing from 18 to 19 to 20 proposals across two test creates.

---

## 2026-07-12 — Verified: real proposal email sending works end-to-end (ISS-041 closed out)

**Verification performed:** With the auth bug above fixed, the user created a test proposal and clicked "Email." First attempt correctly reached Resend for real (no more silent mailto bypass, no more 401) but returned `502 Email send failed`. Terminal logs showed the real reason: `You can only send testing emails to your own email address (raju.1605.jobs@gmail.com)` — this is Resend's standard safety restriction on accounts that haven't verified a sending domain yet (the shared `onboarding@resend.dev` address may only send to the account owner's own address). Not a code bug.

**Confirmation test:** User created a second test proposal using `raju.1605.jobs@gmail.com` as the client email and clicked "Email" again. Result: `"Proposal emailed to raju.1605.jobs@gmail.com."` — real send succeeded, proposal status auto-updated to "Sent."

**Known limitation (documented, not a bug):** until a real domain is verified at resend.com/domains and `EMAIL_FROM` is updated to use it, this system can only deliver to `raju.1605.jobs@gmail.com`. Sending to actual customer addresses requires that one-time Resend domain verification step — not urgent, can be done whenever the user is ready to send real customer emails.

**Status:** ISS-041 (real proposal email sending) is now fully verified working end-to-end, including the underlying auth fix that was blocking it.

---
