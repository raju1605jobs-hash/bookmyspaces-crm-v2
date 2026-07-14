# BookMySpaces V3 — Go-Live Checklist

Branch `feature/v3-omnichannel-platform`, HEAD as of this session. Check off each row only after real verification — not from a prior session's report.

## Repository

- [x] Git status clean of tracked changes
- [x] `git fsck` clean (no corruption)
- [x] Current branch confirmed: `feature/v3-omnichannel-platform`
- [ ] Repo-root cruft removed (6 stale `.git.*` dirs, 2 stray files — blocked from every sandbox session, needs a direct `rm` on your machine)

## Build

- [x] `tsc --noEmit` — 0 errors
- [x] `eslint src` — 0 errors, 1 pre-existing warning (`no-img-element`)
- [x] `vitest run` — 23 files, 164 tests, all passing
- [ ] **`npm run build` completed successfully — never verified in any sandbox session; must be run on your machine before deploying**

## TypeScript

- [x] Clean as of this session, re-verified after every change across RC1 through this session

## ESLint

- [x] Clean (1 pre-existing, non-blocking warning) as of this session

## Tests

- [x] 164/164 passing as of this session

## Environment

- [x] `.env.example` current and accurate (verified this session against actual code reads, per its own ISS-037/038 annotations)
- [x] Core variables set in `.env.local`: Supabase, Anthropic, OpenAI, Google Sheets, WhatsApp (partial — see below), Resend, Cron
- [ ] `WHATSAPP_APP_SECRET` set — **missing; webhook signature verification is currently unenforced without it**
- [ ] All required variables also set in Vercel's Project Settings (separate from `.env.local`)

## Database

- [ ] Live Supabase connectivity confirmed from a real machine (not this sandbox — proxy-blocked here, confirmed once this session, consistent with every prior session)
- [ ] Live schema reviewed against `SCHEMA_DRIFT_REPORT.md` one more time immediately before migrating, in case anything changed since that audit

## Migrations

- [ ] Migration 012 applied (`npm run db:migrate:v3`)
- [ ] Migration 013 applied (same command, same run)
- [ ] `npm run db:smoke-test:v3` — all checks passed
- [ ] **Decision made and executed on migration 004** (apply it, or hide the Campaigns nav link) — see `PRODUCTION_DEPLOYMENT_GUIDE.md` §3a
- [x] Migration 004 rollback script now exists (`004_phase4_campaigns_ROLLBACK.sql`, written this session — previously missing)
- [x] Migration order/dependencies verified: 012 before 013, 004 independent of both

## Secrets

- [x] `CRON_SECRET` set (protects `/api/cron/followups` and `/api/cron/escalations`)
- [ ] `WHATSAPP_APP_SECRET` set (see Environment above — same item, listed twice deliberately since it blocks both a feature and a security control)

## WhatsApp

- [x] Access token and phone number ID configured, outbound sending code-verified (`smartSend`, degrades gracefully if ever unconfigured)
- [x] Webhook verify token set
- [ ] Webhook signature enforcement active (blocked on `WHATSAPP_APP_SECRET` above)
- [ ] Live send/receive round-trip tested (UAT Scenario 1)

## AI

- [x] Anthropic + OpenAI keys configured
- [x] AI Operator Assistant confirmed wired into Customer Profile page, reachable from Customer Search (this session's finding)
- [ ] Live AI Assistant output quality-checked against a real customer record (UAT Scenario 4)

## Payments

- [x] Payment recording route fixed this session (`accepted_at` now set alongside `status`) — verified via `tsc`/`eslint`
- [ ] Live payment recording tested end-to-end, including the Revenue Dashboard correctly reflecting it (UAT Scenarios 11 + 15)

## Deployment

- [ ] `npm run build` succeeds locally (see Build above)
- [ ] Vercel environment variables set (see Environment above)
- [ ] Deployed to production
- [ ] `/api/health` returns 200 post-deploy
- [ ] `/customers` shows real data post-deploy (fastest true "talking to the right DB" check)

## Smoke Test

- [ ] `db:smoke-test:v3` passed (see Migrations above — same item)
- [ ] Manual migration-004 verification passed (`PRODUCTION_DEPLOYMENT_GUIDE.md` §7, if 004 was applied)

## UAT

- [ ] All 16 scenarios in `USER_ACCEPTANCE_TEST_PLAN.md` completed and passed (or failures explicitly accepted with a documented reason)

## Rollback

- [x] 012/013 rollback scripts exist and reviewed
- [x] 004 rollback script now exists (written this session)
- [x] Application rollback is just a Vercel "promote previous deployment" — no script needed, documented in the deployment guide

## Sign-off

- [ ] **Raju Panja — Product Owner sign-off**, after UAT is complete and this checklist is fully green (or every remaining unchecked item has an explicit, accepted reason)

---

Everything checked `[x]` above is independently verified as of this session (git status/build/tsc/eslint/tests re-run fresh, code reads performed directly, not carried forward from a prior report's claim). Everything `[ ]` requires either real Supabase/Vercel access or your direct action — none of it is executable from this sandbox.
