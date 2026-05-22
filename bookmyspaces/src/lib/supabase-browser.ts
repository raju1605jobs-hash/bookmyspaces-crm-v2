// src/lib/supabase-browser.ts
// ─────────────────────────────────────────────────────────────────────────────
// Browser-only Supabase client.
// Safe to import in any 'use client' component.
//
// MUST NOT import:
//   next/headers  ✗
//   next/server   ✗
//   cookies()     ✗
//   NextRequest   ✗
//   NextResponse  ✗
// ─────────────────────────────────────────────────────────────────────────────

import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'

export function createBrowserClient() {
  return _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Re-export UserRole type so client components can import it from one place
export type UserRole = 'admin' | 'manager' | 'sales' | 'marketing'

export interface AuthUser {
  id        : string
  email     : string
  full_name : string | null
  role      : UserRole
  is_active : boolean
}
