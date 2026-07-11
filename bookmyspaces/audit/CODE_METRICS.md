# CODE_METRICS.md — Part 10

All counts VERIFIED via `grep -r` across `src/` with `--include="*.ts" --include="*.tsx"`, run from `bookmyspaces/`.

## Repo-wide counts

| Metric | Count |
|---|---|
| `console.log` / `console.error` / `console.warn` / `console.info` / `console.debug` | 89 |
| `TODO` | 0 |
| `FIXME` | 0 |
| `@ts-ignore` | 0 |
| `@ts-expect-error` | 0 |
| `eslint-disable` | 0 |
| `: any` (typed-as-any parameter/variable annotations) | 53 |
| `as any` (type-cast escapes) | 22 |
| `<any>` (generic-cast escapes) | 2 |

Note on the `console.*` total: this Part's repo-wide scan (89) differs from the `src/app/api/**/route.ts`-only scan reported in ROUTES.md (27) because this count includes `src/lib`, `src/lib/whatsapp`, `src/components`, and all `page.tsx`/`.tsx` files in addition to API routes — both counts are independently VERIFIED for their respective, differently-scoped greps.

## `any`-type erosion vs. `strict: true`

VERIFIED — `tsconfig.json` sets `"strict": true` (see DEPLOYMENT_AUDIT.md), but 53 `: any` annotations + 22 `as any` casts + 2 `<any>` generics = 77 explicit escapes from the type system found across `src/`. Spot-verified examples: `src/lib/sheets.ts:360` (`updateLeadInSheets(lead: any)`), `src/app/api/proposals/email/route.ts:19` (`(proposal.leads as any)?.email`).

## process.env usage, grouped by variable

VERIFIED via `grep -rohE "process\.env\.[A-Z_0-9]+" src --include="*.ts" --include="*.tsx" | sort | uniq -c`:

| Variable | Call sites in `src/` | Declared in `.env.example` | Used anywhere | Centralized |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 7 | YES | YES | NO |
| `ANTHROPIC_API_KEY` | 7 | YES | YES | NO |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 6 | YES | YES | NO |
| `OPENAI_API_KEY` | 4 | YES | YES | NO |
| `GOOGLE_SHEETS_ID` | 4 | YES | YES | NO |
| `WHATSAPP_PHONE_NUMBER_ID` | 3 | NO | YES | NO |
| `WHATSAPP_ACCESS_TOKEN` | 3 | NO | YES | NO |
| `WATI_API_TOKEN` | 2 | YES | YES | NO |
| `NEXT_PUBLIC_SITE_URL` | 2 | NO (`.env.example` has `NEXT_PUBLIC_APP_URL` instead) | YES | NO |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 2 | YES | YES | NO |
| `GOOGLE_PRIVATE_KEY` | 2 | YES | YES | NO |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | 1 | NO (`.env.example` has `WATI_VERIFY_TOKEN` instead) | YES | NO |
| `WATI_BASE_URL` | 1 | YES | YES | NO |
| `SUPABASE_SERVICE_ROLE_KEY` | 1 (direct) | YES | YES | **YES** — the only variable read through a single centralized accessor (`getSupabaseAdmin()` in `src/lib/supabase.ts:15-19`); every other consumer imports the function rather than reading the env var itself |
| `NODE_ENV` | 1 | implicit (Next.js-provided) | YES | NO |
| `NEXT_PUBLIC_BUSINESS_WHATSAPP` | 1 | YES | YES | NO |
| `NEXT_PUBLIC_APP_URL` | 1 | YES | YES | NO |
| `CRON_SECRET` | 1 | NO | YES | NO |

**18 distinct environment variables are read via `process.env.*` across 21 files, with 49 total call sites** (VERIFIED — the sum of the "Call sites" column above is 49; the 21-file figure is independently re-confirmed in this Part via `grep -rl "process\.env\." src --include="*.ts" --include="*.tsx" | wc -l` → 21).

Declared-in-`.env.example`-but-VERIFIED-zero-`process.env`-call-sites-in-`src/`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WATI_VERIFY_TOKEN` (the webhook route reads `WHATSAPP_WEBHOOK_VERIFY_TOKEN` instead — different name), `WATI_WEBHOOK_SECRET`, `NEXT_PUBLIC_BUSINESS_PHONE`.

Full cross-reference table: `env_usage.csv`.

## Empty catch blocks

See ROUTES.md — regex scan for trivially-empty `catch (...) {}` blocks across API routes returned zero matches; not independently re-run for `src/lib`/`src/components`/`src/modules` in this Part (scope of Part 10 is repo-wide counts of the listed metrics only, which does not explicitly include empty-catch detection — that was performed as part of Part 2/ROUTES.md instead).

## UNINSPECTED ITEMS (Part 10 scope)

None remaining — all figures in this Part were independently generated via fresh greps in this session.
