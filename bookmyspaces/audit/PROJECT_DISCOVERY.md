# PROJECT_DISCOVERY.md

Read-only reconnaissance. Project root: `C:\rajubmp\bookmyspaces`. Every claim below is labeled VERIFIED / PARTIALLY VERIFIED / NOT VERIFIED and cites file path + line number(s).

## 1. Repository structure

VERIFIED — `C:\rajubmp` is the git repository root (`.git` present at that level; confirmed via `git remote -v` returning `origin https://github.com/raju1605jobs-hash/bookmyspaces-crm-v2.git`). It contains two Next.js project copies:
- `bookmyspaces/` — the live app (per instructions, this is what this audit covers).
- `BOOKMYSPACES_BACKUP/bookmyspaces/` — acknowledged per instructions, not inspected.

VERIFIED — `C:\rajubmp\.vercel\repo.json` (5 lines): `"directory": "bookmyspaces"`, `"name": "bookmyspaces-crm-v2"`, `"id": "prj_vPu7G6TdphNVZOgkFPBgSB4TFXY2"`, `"orgId": "team_l1bpsTftKKB8A2gZZJE4xQVJ"` — confirms Vercel deploys the `bookmyspaces/` subfolder.

VERIFIED — `bookmyspaces/` top-level entries (via directory listing): `.env.example`, `.env.local`, `.env.local.20260603.backup`, `.eslintrc.json`, `PROJECT_ACCESS.md`, `PROJECT_CONTEXT.md`, `README.md`, `all_routes.txt`, `clean-supabase-imports.js`, `dedup-route-exports.js`, `deployed_route.txt`, `deployment-trigger.txt`, `finish-migration.js`, `fix-all-missing-types.js`, `fix-deployment.js`, `fix-supabase-types.js`, `fix-vercel-route.js`, `git` (0 bytes), `latest.json`, `logs.json`, `logs.txt`, `middleware.ts`, `migrate-supabase-admin.js`, `next-env.d.ts`, `next.config.js`, `npm` (0 bytes), `package-lock.json`, `package.json`, `postcss.config.js`, `src/`, `supabase/`, `tailwind.config.js`, `tailwind.config.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `vercel.json`. Historical helper scripts (`clean-supabase-imports.js`, `dedup-route-exports.js`, `finish-migration.js`, `fix-all-missing-types.js`, `fix-deployment.js`, `fix-supabase-types.js`, `fix-vercel-route.js`, `migrate-supabase-admin.js`) are catalogued per instructions, not inspected further.

VERIFIED — `bookmyspaces/src/` folder map (via `find`):
```
src/
  app/
    (crm)/            campaigns, dashboard(+leads/import, +revenue), kanban, proposals(+new,+share/[token]), settings, whatsapp
    actions/
    admin/
    analytics/
    api/               31 route.ts files (verified count, see ROUTES.md) + 2 misnamed unreachable .ts files + 3 empty brace-glob dirs + 1 empty stray dir + 1 stray .zip
    auth/              callback/, login/
  components/          auth/, chatbot/, layout/ — 4 files total
  constants/
  lib/                 26 .ts files + whatsapp/ subfolder (5 files)
  middleware.ts
  modules/             automation/, followups/, leads/
  services/whatsapp/   1 file
  types/
```

## 2. Technology stack

VERIFIED via `bookmyspaces/package.json`:
- `next: 14.2.5` (dependencies), `react: ^18`, `react-dom: ^18`, `typescript: ^5` (devDependencies).
- `@supabase/supabase-js: ^2.43.4`, `@supabase/ssr: ^0.3.0`.
- `@anthropic-ai/sdk: ^0.24.3`, `openai: ^4.52.7`.
- `googleapis: ^140.0.1`.
- `zod: ^3.23.8` (declared — usage traced separately, see ROUTES.md / CODE_METRICS.md: VERIFIED zero imports anywhere in `src/`).
- `tailwindcss: ^3.4.1`, `@radix-ui/*` (8 packages), `framer-motion: ^11.3.2`, `lucide-react: ^0.400.0`.
- `mammoth: ^1.7.2`, `pdf-parse: ^1.1.1`, `xlsx: ^0.18.5`, `multer: ^1.4.5-lts.1`.
- No test framework in `dependencies` or `devDependencies` (VERIFIED — see CODE_METRICS.md).

## 3. Architecture (as observed, not inferred)

VERIFIED — App Router structure: page routes under `src/app/(crm)/**/page.tsx`, `src/app/admin/page.tsx`, `src/app/analytics/page.tsx`, `src/app/auth/login/page.tsx`, and API routes under `src/app/api/**/route.ts`.

VERIFIED — 31 of 31 discovered route handlers import `getSupabaseAdmin` from `@/lib/supabase` (service-role client) except 6: `src/app/api/admin/users/route.ts` (imports both `getSupabaseAdmin` and `getCurrentUser`), `src/app/api/auth/callback/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/leads/import/route.ts` (session client only), `src/app/api/ai-summary/route.ts` (no DB client — stub), and `src/app/api/notifications/route.ts` (imports both). Full breakdown in ROUTES.md / `routes.csv`.

VERIFIED — Two parallel WhatsApp code paths exist:
1. `src/lib/whatsapp.ts` (252 lines) — Meta Cloud API v23.0 direct integration, imported by `src/app/api/whatsapp/webhook/route.ts:6`, `src/app/api/whatsapp/send/route.ts:8`, `src/app/api/whatsapp/campaigns/route.ts:6`, and `src/lib/queue.ts`.
2. `src/lib/whatsapp/*.ts` (5 files) + `src/services/whatsapp/process-inbound.ts` — a separate conversation state-machine. VERIFIED via `grep -rl` that `src/services/whatsapp/process-inbound.ts` (the entry point of this subsystem) has zero importers anywhere in `src/app`, `src/lib`, `src/modules`, or `src/services` (search returned empty). See LIBRARY_INVENTORY.md.

## 4. Database / Supabase

VERIFIED — `bookmyspaces/supabase/migrations/` contains 9 files: `001_initial_schema.sql` (266 lines), `002_phase2_whatsapp.sql` (117), `003_phase3_proposals.sql` (158), `004_phase4_campaigns.sql` (162), `005_stability_patch.sql` (345), `006_final_verification.sql` (289), `007_missing_tables.sql` (318), `008_phase1_lead_scoring.sql` (111), `010_phase5_proposal_intelligence.sql` (344). Numbering jumps from `008` to `010` — no `009_*.sql` file exists anywhere in the repository (VERIFIED via `find` across the full repo, zero results).

VERIFIED — `bookmyspaces/007_missing_tables.sql` (at the `bookmyspaces/` root, not inside `supabase/migrations/`) is byte-identical to `bookmyspaces/supabase/migrations/007_missing_tables.sql` (confirmed via `diff`, zero output). A second identical copy also exists at the outer repo root `C:\rajubmp\007_missing_tables.sql`.

Full table/column/RLS/policy detail: see DATABASE_AUDIT.md and `migrations.csv`.

## 5. Authentication

VERIFIED — Real Supabase Auth session flow (`supabase.auth.signInWithPassword` in `src/app/auth/login/page.tsx:26`), not a hardcoded admin login. `ADMIN_EMAIL`/`ADMIN_PASSWORD` are declared in `.env.example:40-41` and `.env.local` but VERIFIED zero `process.env.ADMIN_EMAIL` / `process.env.ADMIN_PASSWORD` call sites anywhere in `src/` (grep across `src/`, `*.js` root scripts, and `.env.example` returned only the two declaration lines in `.env.example`). Full trace in AUTH_AUDIT.md.

## 6. AI integration

VERIFIED — Dual SDK: `@anthropic-ai/sdk` and `openai` both imported (exact call sites catalogued in LIBRARY_INVENTORY.md). `src/lib/ai.ts:26` defines `SYSTEM_PROMPT` for a persona named "Aria". RAG implemented via `src/lib/ai.ts:196` (`generateEmbedding`) and `src/lib/ai.ts:204` (`retrieveRelevantKnowledge`), backed by the `knowledge_chunks` table (pgvector, `supabase/migrations/001_initial_schema.sql:119`).

## 7. WhatsApp integration

VERIFIED — Live path: `src/lib/whatsapp.ts:17` hardcodes `META_API_VERSION = 'v23.0'`; reads `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` (lines 21-22, 63-64). Webhook handshake at `src/app/api/whatsapp/webhook/route.ts:17` (`hub.verify_token`). POST handler at line 48 — VERIFIED no `X-Hub-Signature-256` / HMAC verification code exists anywhere in this file (full-file read).

## 8. Email integration

VERIFIED — `src/app/api/proposals/email/route.ts` (43 lines, full file read) does NOT send email server-side. It builds a `mailto:` URL (line 34) and returns it to the caller with `note: 'SMTP not configured — use mailto_url to open in email client'` (line 38). No transactional email provider package (SendGrid/Resend/SES/nodemailer) exists in `package.json` dependencies (VERIFIED absence). Line 36 fires an unawaited `supabaseAdmin.from('proposals').update(...)` promise with only a `.catch(() => {})` — the calling code has no way to know if this write succeeded before the response is returned.

## 9. Google Sheets integration

VERIFIED — `src/lib/sheets.ts` (362 lines). `isSheetsConfigured()` at line 81. Reads `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID` (see `env_usage.csv`).

## 10. Proposal system

VERIFIED — Table `proposals` created `supabase/migrations/003_phase3_proposals.sql:9`, extended by `010_phase5_proposal_intelligence.sql`. PDF generation: `src/lib/proposal-pdf.ts` (586 lines), `generateProposalHTML` exported at line 170; imports Google Fonts via `@import url('https://fonts.googleapis.com/...')` at line 278 (VERIFIED — network dependency at render time).

## 11. Analytics

VERIFIED — `analytics_events` table (`supabase/migrations/007_missing_tables.sql:56`), `track_event()` function (line 231), `src/app/api/analytics/route.ts` (282 lines), `src/app/analytics/page.tsx` (444 lines).

## 12. Admin area

VERIFIED — `src/app/admin/page.tsx` (239 lines) — knowledge-base admin UI, backed by `src/app/api/knowledge/route.ts` and `src/app/api/admin/users/route.ts`. See AUTH_AUDIT.md for the role-check finding on the latter.

## 13. Deployment configuration

VERIFIED — `bookmyspaces/vercel.json`: `regions: ["bom1"]`, per-route `maxDuration` overrides for 7 routes, one cron: `{"path": "/api/cron/followups", "schedule": "0 9 * * *"}`. Full content reproduced in DEPLOYMENT_AUDIT.md.

## 14. Environment configuration

VERIFIED — `.env.example` documents 18 variables across sections SUPABASE / AI / GOOGLE SHEETS / APP CONFIG / ADMIN / BUSINESS INFO / WHATSAPP (WATI). Actual `process.env.*` usage in `src/` covers 18 distinct variable names (some overlapping, some not — see `env_usage.csv` for the full cross-reference including declared-but-unused and used-but-undeclared variables).

## 15. Additional folders (identified, minimally inspected)

VERIFIED via `find`:
- `src/app/actions/` contains exactly 1 file: `auth.ts` (contents not read line-by-line — existence only VERIFIED).
- `src/types/` contains exactly 1 file: `whatsapp.ts` (contents not read line-by-line — existence only VERIFIED).
- `src/constants/` contains exactly 1 file: `conversation-states.ts` (referenced by the dead WhatsApp v2 subsystem per LIBRARY_INVENTORY.md; contents not read line-by-line — existence only VERIFIED).

## UNINSPECTED ITEMS (Part 1 scope)

- `BOOKMYSPACES_BACKUP/bookmyspaces/` — acknowledged only, not inspected, per explicit instruction.
- `src/app/actions/auth.ts`, `src/types/whatsapp.ts`, `src/constants/conversation-states.ts` — existence and file count VERIFIED, but full line-by-line contents NOT read (not required by any of the 11 Parts, which scope library/module inspection to `src/lib`, `src/lib/whatsapp`, `src/services/whatsapp`, and `src/modules`).
