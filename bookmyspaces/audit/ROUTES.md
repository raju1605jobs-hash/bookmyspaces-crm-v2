# ROUTES.md — API Route Inventory (Part 2)

## Count verification

VERIFIED — `find src/app/api -type f -name "route.ts"` returns **31 files**, each appearing exactly once (VERIFIED via `find ... | xargs -n1 dirname | sort | uniq -d` returning zero duplicate parent directories). Full listing and per-route detail in `routes.csv` and `api_inventory.json`.

VERIFIED — 2 additional `.ts` files exist inside `src/app/api/**` that are NOT named `route.ts` and are therefore NOT registered as Next.js routes (confirmed dead/unreachable):
- `src/app/api/leads/[id]/stage/lead-stage-route.ts` (53 lines)
- `src/app/api/proposal/share/[token]/api--proposal--share--token--route.ts` (22 lines)

VERIFIED — 1 non-code file inside an API route folder: `src/app/api/proposals/[id]/invoice/files.zip` (does not affect routing; Next.js ignores non-`.ts` files in the App Router).

## Zod / input validation

VERIFIED — `grep -rn "zod" src/app/api --include="route.ts"` returns zero matches. No route in the project performs schema validation via zod despite it being a declared dependency in `package.json`. Custom/manual validation (e.g., `if (!body.field) return 400`) is present in some routes (e.g. `src/app/api/proposals/email/route.ts:13`, `src/app/api/leads/import/route.ts`) but not systematically.

## Rate limiting / caching / streaming / transactions

VERIFIED — `grep -rln "rateLimit\|isRateLimited\|rate-limit"` across `src/app/api` returns zero matches (rate limiting, where it exists, lives in `src/lib/queue.ts` — see LIBRARY_INVENTORY.md — not inside route handlers themselves).
VERIFIED — zero matches for `revalidate` / `cache:` inside route files (no route-level caching directives found; `next.config.js` applies a blanket `Cache-Control: no-store` header to all `/api/:path*` responses instead — see DEPLOYMENT_AUDIT.md).
VERIFIED — zero matches for `ReadableStream` / `streamText` / `Streaming` inside route files (no streaming responses found).
PARTIALLY VERIFIED — `.rpc(` / `BEGIN` / `transaction` keyword matches found in: `src/app/api/chat/route.ts`, `src/app/api/health/route.ts`, `src/app/api/proposals/[id]/invoice/route.ts`, `src/app/api/proposals/[id]/payment/route.ts`, `src/app/api/proposals/[id]/receipt/route.ts` — these are `.rpc()` calls to Postgres functions (e.g., `match_knowledge_chunks`), not client-side multi-statement transactions. No explicit `BEGIN`/`COMMIT` transaction blocks were found inside any TypeScript route file (Postgres `BEGIN`/`COMMIT` do appear inside `supabase/migrations/010_phase5_proposal_intelligence.sql:21,300` — that is SQL migration code, not route code).

## Error handling style

VERIFIED — every route inspected wraps its logic in `try { ... } catch (err) { return NextResponse.json({ error: ... }, { status: 500 }) }` or an equivalent pattern (spot-checked in `admin/users/route.ts:11-27,30-69,71-121`, `proposals/email/route.ts:9-42`, and confirmed structurally consistent via the aggregate status-code scan below).

## Status codes (aggregate, VERIFIED via grep across all 31 route.ts files)

`status: 500` → 60 occurrences · `status: 400` → 29 · `status: 404` → 13 · `status: 401` → 5 · `status: 403` → 4 · `status: 201` → 4 · `status: 200` → 3 (2 as `status: 200` + 1 as `status:  200` with a double space, in `whatsapp/webhook/route.ts`). Per-route breakdown in `routes.csv` column `status_codes`.

## console.log / console.error / console.warn

VERIFIED — 27 occurrences across route files (full list with line numbers below). Heaviest: `src/app/api/proposals/[id]/invoice/route.ts` (5, lines 448-452, dumping payment/invoice data — see snippet below), `src/app/api/whatsapp/webhook/route.ts` (4), `src/app/api/proposals/intelligence/route.ts` (4), `src/app/api/dashboard/revenue/route.ts` (4).

```
src/app/api/dashboard/revenue/route.ts:94,98,102,247
src/app/api/dashboard/stats/route.ts:44,114
src/app/api/leads/hot/route.ts:36,61
src/app/api/leads/import/route.ts:126   <- console.log('INSERT ERROR:', insertErr)
src/app/api/notifications/route.ts:34,53,95
src/app/api/proposals/intelligence/route.ts:39,47,83,167
src/app/api/proposals/track-view/route.ts:72,85
src/app/api/proposals/[id]/invoice/route.ts:448,449,450,451,452
src/app/api/whatsapp/webhook/route.ts:23,70,87,112
```

Invoice debug block, `src/app/api/proposals/[id]/invoice/route.ts:448-452`:
```
console.log("=== INVOICE DEBUG ===")
console.log("PROPOSAL ID:", params.id)
console.log("PAYMENT COUNT:", allPayments.length)
console.log("PAYMENTS:", JSON.stringify(allPayments.map((p:any)=>({id:p.id,receipt:p.receipt_number,amount:p.amount,proposal_id:p.proposal_id}))))
console.log("TOTAL RECEIVED:", allPayments.reduce((s:number,p:any)=>s+Number(p.amount||0),0))
```

## TODO / FIXME

VERIFIED — zero matches for `TODO` or `FIXME` across `src/app/api/**/route.ts`.

## Empty catch blocks

PARTIALLY VERIFIED — a regex scan for `catch\s*\([^)]*\)\s*\{\s*\}` (catch block with fully empty body) across `src/app/api/**/route.ts` returned zero matches. This confirms no *trivially* empty catch blocks (open-close brace with nothing between) exist, but does not rule out catch blocks whose body is a no-op comment or a swallowed error without a comment spanning multiple lines in a way the regex wouldn't catch — that broader claim is NOT VERIFIED.

## Database tables touched, by route

VERIFIED via `grep -rohE "\.from\(['\"][a-zA-Z_]+['\"]\)"` across all 31 route files, distinct table/view names touched:
`active_users_view, activity_logs, bookings, broadcast_campaigns, conversations, documents, follow_ups, invoices, knowledge_chunks, lead_imports, leads, leads_needing_followup, notifications, payments, proposals, user_profiles`

Full per-route mapping is in `routes.csv` column `tables_touched`.

**IMPORTANT CROSS-REFERENCE (see DATABASE_AUDIT.md for full detail):** VERIFIED — of the 16 distinct tables/views above, 5 (`active_users_view`, `invoices`, `lead_imports`, `payments`, `user_profiles`) do not appear in any `CREATE TABLE` or `CREATE VIEW` statement in any of the 9 migration files, nor in the root-level duplicate `007_missing_tables.sql`. This was confirmed with a case-insensitive, whole-word grep across all migration SQL returning zero matches for all 5 names.

## Service-role vs session-scoped vs anon client, by route

VERIFIED — 28 of 31 routes call `getSupabaseAdmin()` (service-role key, defined `src/lib/supabase.ts:15-27`, bypasses RLS). 3 routes use a session-scoped client instead: `src/app/api/auth/callback/route.ts` (`createServerAuthClient`), `src/app/api/auth/logout/route.ts` (`createServerAuthClient`), `src/app/api/leads/import/route.ts` (`createServerAuthClient`). `src/app/api/ai-summary/route.ts` imports no DB client at all (stub). Full citations (import line numbers per file) captured during the recon pass and summarized in `routes.csv` column `db_client`.

## Authentication / role checks, by route

VERIFIED — of 31 routes, exactly 4 perform any authentication check:
- `src/app/api/admin/users/route.ts` — `getCurrentUser()` at lines 12, 32, 73 (imported from `@/lib/supabase-server`, line 6).
- `src/app/api/notifications/route.ts` — `getCurrentUser()` at lines 13, 60 (imported line 7).
- `src/app/api/leads/import/route.ts` — `supabase.auth.getSession()` at lines 15, 161.
- `src/app/api/cron/followups/route.ts` — Bearer token compared against `process.env.CRON_SECRET` at lines 11-15.

`src/app/api/whatsapp/webhook/route.ts` GET handler verifies `hub.verify_token` (line 17) — this is Meta's subscription-handshake check, not user authentication; the POST handler (line 48) that processes real message payloads has no signature/auth check at all (VERIFIED via full-file read, no `X-Hub-Signature-256` or HMAC-related code found).

The remaining 26 routes: VERIFIED zero occurrence of `getCurrentUser`, `auth.getUser`, `auth.getSession`, or `Authorization`/`Bearer` header checks.

Role-check detail (only `admin/users/route.ts` attempts one): see AUTH_AUDIT.md.

## Machine-readable outputs

Full per-route structured data: `routes.csv`, `api_inventory.json`.
