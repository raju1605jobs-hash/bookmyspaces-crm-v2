# AUTH_AUDIT.md — Authentication Trace (Part 3)

## Files inspected (full read)

`src/app/auth/login/page.tsx` (151 lines), `src/app/auth/callback/route.ts` (44 lines), `src/app/api/auth/callback/route.ts` (25 lines), `src/app/api/auth/logout/route.ts` (23 lines), `src/lib/supabase-server.ts` (55 lines), `src/lib/supabase-route-handler.ts` (29 lines), `src/lib/supabase-middleware.ts` (38 lines), `src/lib/supabase-browser.ts` (32 lines), `src/lib/supabase.ts` (27 lines), `middleware.ts` (root, 43 lines), `src/middleware.ts` (18 lines), `src/app/api/admin/users/route.ts` (121 lines).

## Login

VERIFIED — `src/app/auth/login/page.tsx:25-29`:
```
const supabase = createBrowserClient()
const { data, error: authError } = await supabase.auth.signInWithPassword({
  email: email.trim(),
  password,
})
```
`createBrowserClient()` is defined in `src/lib/supabase-browser.ts:16-21`, using `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. On success, `router.push(redirect)` + `router.refresh()` at `login/page.tsx:45-46`. `redirect` defaults to `/dashboard` (`login/page.tsx:11`).

VERIFIED — This is real Supabase Auth (anon-key + password grant), not a custom/hardcoded check against `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Session creation / cookie handling

VERIFIED — Four distinct Supabase client constructors exist, each scoped to a different Next.js execution context:
1. `src/lib/supabase-browser.ts:16-21` (`createBrowserClient`) — browser/client components. Explicit comment block (lines 6-11) prohibits importing `next/headers`, `next/server`, `cookies()`, `NextRequest`, `NextResponse`.
2. `src/lib/supabase-server.ts:11-37` (`createSupabaseServerClient`, aliased `createServerAuthClient` at line 40) — uses `next/headers` `cookies()` (line 2, 12), `getAll()`/`setAll()` cookie adapter (lines 19-33). `setAll` wraps `cookieStore.set` in a try/catch that silently ignores errors (lines 26-32, comment: "Ignored when called from a Server Component render pass").
3. `src/lib/supabase-route-handler.ts:5-29` (`createSupabaseRouteHandlerClient`) — takes `NextRequest`/`NextResponse`, reads/writes cookies on both objects (lines 15-24).
4. `src/lib/supabase-middleware.ts:15-38` (`createMiddlewareAuthClient`) — Edge-Runtime-safe variant, explicit comment (lines 6-8) that `next/headers` is unavailable in Edge Runtime.

VERIFIED — `getCurrentUser()` (`src/lib/supabase-server.ts:43-55`):
```
export async function getCurrentUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) { return null; }
  return user;
}
```
This returns the raw Supabase Auth `User` object as-is. It performs no join against any application-level profile table.

## Logout

VERIFIED — `src/app/api/auth/logout/route.ts:9-13` (POST) and `:16-23` (GET) both call `supabase.auth.signOut()` via `createServerAuthClient()`, then redirect to `/auth/login` using `process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'` as the base URL (lines 12, 20).

## OAuth / magic-link callback — DUPLICATE IMPLEMENTATIONS

VERIFIED — two separate callback route files exist and both are live (different paths, no collision):
- `src/app/api/auth/callback/route.ts:16-24` — uses `createServerAuthClient()` from `src/lib/supabase-server.ts`, redirect param name is `redirect` (line 13), failure path redirects to `/auth/login?error=callback_failed` (line 24).
- `src/app/auth/callback/route.ts:16-43` — constructs its own inline `createServerClient(...)` (not reusing `supabase-server.ts`), redirect param name is `next` (line 8), failure path redirects to `/auth/auth-code-error` (lines 11, 40) — a route/page whose existence was NOT VERIFIED in this pass (not found among the 12 pages catalogued in PAGE_INVENTORY.md; if it doesn't exist, this failure path would 404).

Both call `supabase.auth.exchangeCodeForSession(code)`.

## Protected routes / middleware

VERIFIED — TWO middleware files exist:
1. `src/middleware.ts` (18 lines) — this is the ACTIVE one Next.js executes, because the project uses the `src/` directory convention. Full content:
```
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
const pathname = request.nextUrl.pathname
if (
pathname.startsWith('/auth') ||
pathname.startsWith('/api') ||
pathname.startsWith('/_next') ||
pathname.includes('.')
) {
return NextResponse.next()
}
// TEMP: allow everything while stabilizing app
return NextResponse.next()
}
export const config = {
matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```
VERIFIED — every code path in this function returns `NextResponse.next()` unconditionally; there is no branch that redirects, blocks, or checks a session. The comment `// TEMP: allow everything while stabilizing app` appears directly above the final return (matches the source verbatim).

2. `middleware.ts` (root of `bookmyspaces/`, 43 lines) — NOT executed by Next.js in a `src/` layout project (Next.js resolves `src/middleware.ts` when a `src/` directory is present; this is standard Next.js 14 behavior, PARTIALLY VERIFIED — the behavior itself is standard documented Next.js convention, not something re-derived from this codebase, but the presence of both files and their divergent content is directly VERIFIED). This file's auth logic is fully commented out (lines 20-25: an example block showing `token = request.cookies.get("auth-token")` guarded entirely inside a comment) and it unconditionally returns `NextResponse.next()` at line 27, with a `console.log("[Middleware] Passing through API route:", pathname)` at line 15 for every request matching `pathname.startsWith("/api/")`.

VERIFIED — neither middleware file references `getCurrentUser`, `supabase.auth`, or any session-checking function. Route-level protection for pages (`(crm)/*`, `/admin`, `/analytics`) was NOT VERIFIED to exist anywhere else either — no `layout.tsx` files were inspected for auth guards in this pass (see UNINSPECTED ITEMS).

## Admin-only logic / role checks

VERIFIED — `src/app/api/admin/users/route.ts` is the only route in the entire API surface that performs a role check (cross-referenced against the full 31-route auth scan in ROUTES.md).

VERIFIED — three call sites, all checking `user.role`:
- Line 13: `if (!user || (user.role !== 'admin' && user.role !== 'manager')) { ... 403 }` (GET)
- Line 33: `if (!user || user.role !== 'admin') { ... 403 }` (PATCH)
- Line 74: `if (!user || user.role !== 'admin') { ... 403 }` (POST)

VERIFIED — `user` in all three cases is the return value of `getCurrentUser()` (`src/lib/supabase-server.ts:43-55`), which is the raw object returned by `supabase.auth.getUser()`. This is the standard Supabase Auth `User` type. PARTIALLY VERIFIED (based on standard, documented Supabase Auth `User` shape, not re-derived from this repo's runtime): the `.role` field on this object is Postgres/GoTrue's internal role string (typically `"authenticated"`), not an application-defined value like `'admin'` or `'manager'`.

VERIFIED — the application's actual role model lives in a separate `user_profiles` table, referenced at:
- `admin/users/route.ts:19` — `db.from('active_users_view').select('*')`
- `admin/users/route.ts:47-49` — `db.from('user_profiles').update({ role: body.role, ... })`
- `admin/users/route.ts:101-110` — `db.from('user_profiles').insert({ id: authData.user.id, role: body.role, ... })`

VERIFIED — nowhere in `getCurrentUser()`, nor anywhere in `admin/users/route.ts`, is there a query that joins the authenticated user's ID against `user_profiles.role` before performing the `user.role !== 'admin'` comparison. The comparison is checking a field that was never populated from `user_profiles`.

**Cross-reference to DATABASE_AUDIT.md:** `active_users_view` (read at line 19) and `user_profiles` (written at lines 47, 101) do not appear in any `CREATE TABLE`/`CREATE VIEW` statement across all 9 migrations (VERIFIED absence, see DATABASE_AUDIT.md §"Tables/views referenced in code but absent from migrations").

## ADMIN_EMAIL / ADMIN_PASSWORD usage

VERIFIED — `grep -rn "ADMIN_EMAIL\|ADMIN_PASSWORD" src/ *.js .env.example` (run from `bookmyspaces/`) returns exactly 2 matches, both in `.env.example`:
```
.env.example:40:ADMIN_EMAIL=admin@bookmyspaces.in
.env.example:41:ADMIN_PASSWORD=change-this-strong-password
```
Zero matches anywhere in `src/` or in any root-level `.js` helper script. These variables are declared but VERIFIED unused by any code path.

## Whether Supabase Auth is "actually used"

VERIFIED YES — for login (password grant), logout, and OAuth/magic-link callback, real Supabase Auth session flows are used and are the only login mechanism found (no parallel/fallback login path was found).

VERIFIED NO enforcement layer sits in front of it — middleware is a no-op (above) and 26 of 31 API routes perform no session check at all (see ROUTES.md).

VERIFIED — page-level (layout) guards also do not exist. `find src/app -name "layout.tsx"` returns exactly 3 files: `src/app/layout.tsx` (root), `src/app/(crm)/layout.tsx` (12 lines, full read), `src/app/(crm)/dashboard/layout.tsx` (11 lines, full read). Neither of the two `(crm)` layout files contains any auth-related code (zero matches for `auth`/`getCurrentUser`/`redirect`/`getUser` in the root layout; the `(crm)` layout only renders `<CRMLayout>{children}</CRMLayout>` with page metadata, and the dashboard layout only renders `<>{children}</>` with metadata). `src/components/layout/CRMLayout.tsx` (56 lines, full read) — a client component (`'use client'`, line 1) — renders a sidebar nav (`Link`/`usePathname` only) and contains zero auth logic. VERIFIED — no `layout.tsx` file exists for `src/app/admin/` or `src/app/analytics/` at all (not found by `find`), so those routes inherit only the root layout, which also has no auth check.

**Conclusion: VERIFIED, with no remaining gap in this pass — there is no authentication enforcement anywhere in the request path for any page or API route in this application, other than the 4 individually-coded route checks listed above.**

## Additional finding: broken redirect target

VERIFIED — `src/app/auth/callback/route.ts:11` and `:40` redirect to `${origin}/auth/auth-code-error` on failure. `find src/app/auth -type d -o -type f` shows only `src/app/auth/callback/route.ts` and `src/app/auth/login/page.tsx` exist under `src/app/auth/` — there is no `auth-code-error` page anywhere in the project. This redirect target does not exist.

## UNINSPECTED ITEMS (Part 3 scope)

None remaining for this Part — all layout files, both callback implementations, both middleware files, all 4 route-level auth checks, and the admin role-check chain were read in full.
