import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieItem } from '@/lib/supabase-types';

// Paths that must never be intercepted regardless of auth state.
// WhatsApp webhook routes are intentionally excluded here.
const PUBLIC_PATHS: RegExp[] = [
  /^\/api\/webhook(\/.*)?$/,
  /^\/auth(\/.*)?$/,
  /^\/_next(\/.*)?$/,
  /^\/favicon\.ico$/,
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Never intercept webhook or public routes
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
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

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook).*)',
  ],
};
