// src/app/api/auth/callback/route.ts
// Handles Supabase auth callback (OAuth, magic links, email confirmation).
// ISS-027: logic now lives in src/lib/auth-callback.ts (shared with src/app/auth/callback/route.ts)
// so both callback URL paths behave identically instead of diverging.

export const dynamic = 'force-dynamic'

export { handleAuthCallback as GET } from '@/lib/auth-callback'
