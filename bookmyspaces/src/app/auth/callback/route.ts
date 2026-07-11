// src/app/auth/callback/route.ts
// Handles Supabase auth callback (OAuth, magic links, email confirmation).
// ISS-027: logic now lives in src/lib/auth-callback.ts (shared with src/app/api/auth/callback/route.ts)
// so both callback URL paths behave identically instead of diverging. This file
// previously reimplemented its own inline cookie handling and redirected failures to
// the nonexistent /auth/auth-code-error page (ISS-028) — both are now fixed by delegating
// to the shared handler.

export const dynamic = 'force-dynamic'

export { handleAuthCallback as GET } from '@/lib/auth-callback'
