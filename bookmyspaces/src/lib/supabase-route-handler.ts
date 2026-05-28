import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { CookieItem } from './supabase-types';

export function createSupabaseRouteHandlerClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll(): CookieItem[] {
          return request.cookies.getAll().map((c) => ({
            name: c.name,
            value: c.value,
          }));
        },
        setAll(cookiesToSet: CookieItem[]): void {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}
