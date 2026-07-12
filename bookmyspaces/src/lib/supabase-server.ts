import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

export interface CookieItem {
  name: string;
  value: string;
  options?: CookieOptions;
}

// BUGFIX (found via live testing, 2026-07-12): the installed version of
// @supabase/ssr in this project (0.3.0 — see package.json) only supports the
// older per-cookie `get`/`set`/`remove` interface (confirmed against
// node_modules/@supabase/ssr/dist/index.d.ts's CookieMethods type — it has
// no `getAll`/`setAll` at all). This function previously passed `getAll`/
// `setAll` methods, which this version of the library silently never calls,
// so it could never actually read the session cookie — every API route
// using requireAuth()/requireRole() (src/lib/auth-guard.ts) always got a
// "no user" result and returned 401, regardless of whether the person was
// really logged in. Page navigation worked the whole time because
// src/lib/supabase-middleware.ts happened to already use the correct
// get/set/remove style. Rewritten here to match that same, working style.
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Ignored when called from a Server Component render pass
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Ignored when called from a Server Component render pass
          }
        },
      },
    }
  );
}

// Legacy alias: routes importing createServerAuthClient continue to work
export const createServerAuthClient = createSupabaseServerClient;

// Legacy helper: routes importing getCurrentUser continue to work
export async function getCurrentUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}
