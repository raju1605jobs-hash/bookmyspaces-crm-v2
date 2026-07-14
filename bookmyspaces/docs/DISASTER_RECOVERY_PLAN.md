# BookMySpaces V3 — Disaster Recovery Plan

Scenario-by-scenario, for whoever is on call when something goes badly wrong.

## Scenario 1 — Application Down / Broken Deploy

**Symptoms:** `/api/health` failing, pages erroring, or a broken deploy just went out.
**Response:** Vercel Dashboard → Deployments → previous known-good deployment → Promote to Production. This is instant and carries no data risk — always the first move, before investigating root cause. Then follow `DEPLOYMENT_RUNBOOK.md`'s Incident Response steps.

## Scenario 2 — Database Unreachable

**Symptoms:** every page that touches Supabase fails; `/api/health` reports a database error specifically (not a generic 500).
**Response:** Check Supabase's own status page and your project's dashboard first — this is very likely a Supabase-side incident, not something in this codebase, since the app has no local database fallback. If Supabase confirms an outage, there's nothing to do but wait and communicate the ETA to staff/guests. If the project itself looks paused/suspended (common on free-tier projects after inactivity, or on a billing issue), resolve that directly in the Supabase dashboard.

## Scenario 3 — Data Loss / Corruption

**Symptoms:** records missing or visibly wrong that shouldn't be — not a display bug (check the UI logic first if only one page is affected), but genuinely absent/incorrect data across multiple views.
**Response:**
1. Stop any process that might still be writing bad data (pause cron jobs, ask staff to hold off on the affected workflow).
2. Do **not** immediately restore from backup — first determine how far back the corruption goes, so you don't lose more recent good data than necessary.
3. Restore per `BACKUP_AND_RESTORE.md`, to a *new* Supabase project first if there's any uncertainty, verify the restored data looks right, then cut over.
4. Root-cause afterward — was this a bad migration, a bug, or an operator error? Each has a different prevention.

## Scenario 4 — Credential / Secret Compromise

**Symptoms:** unexpected API usage/billing on Anthropic, OpenAI, Meta, Resend, Google, or Supabase; unauthorized access observed.
**Response:**
1. Rotate the specific compromised credential immediately at its source (each provider's own dashboard) — don't wait to investigate scope first, a live compromised key is an active risk every minute it's valid.
2. Update the new value in both `.env.local` (if a sandbox/dev environment needs it) and Vercel's Project Settings, then redeploy.
3. For `SUPABASE_SERVICE_ROLE_KEY` specifically — this key bypasses RLS entirely; if compromised, treat it as a full data-access incident, not just an API-abuse one, and review Supabase's access logs for what was actually touched.
4. Audit how the credential leaked (committed to git? logged accidentally? shared insecurely?) and close that specific hole — RC2's session found and fixed a real instance of PII/log files being committed to git history in this project's past; that class of leak is a known risk here specifically, not a hypothetical.

## Scenario 5 — WhatsApp Integration Failure

**Symptoms:** messages not sending or not being received.
**Response:** Check Meta for Developers dashboard for the app's health/status first (rate limits, template approval issues, and outages are common causes and are entirely on Meta's side). Confirm `WHATSAPP_ACCESS_TOKEN` hasn't expired (Meta tokens can be time-limited depending on app review status) and `WHATSAPP_PHONE_NUMBER_ID` is still correct. If receiving specifically is broken but sending works, check the webhook URL is still correctly registered in Meta's dashboard and matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

## Scenario 6 — Extended Outage (Multiple Systems)

**Response:** Fall back to manual operation — phone/WhatsApp directly with guests, pen-and-paper or a spreadsheet for active reservations, and reconcile into the system once it's back. A hospitality business cannot simply stop taking guests during a technical outage; make sure reception staff know this fallback is expected and acceptable, not a failure on their part.

## Contacts & Escalation

This document doesn't hardcode specific personal contact information (it will go stale) — maintain a separate, current on-call/escalation list outside this file, and reference it here by pointer once it exists. At minimum: who has Supabase dashboard access, who has Vercel access, and who has the Meta for Developers app access, since each of the scenarios above needs at least one of those.

## After Any Disaster Recovery Event

Write a short post-incident note (what happened, what was done, what would prevent it next time) and add any new, concrete lesson to this document or `DEPLOYMENT_RUNBOOK.md` directly — a disaster recovery plan that isn't updated after being used stays theoretical.
