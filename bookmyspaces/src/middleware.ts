import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
const pathname = request.nextUrl.pathname

// Allow public routes
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
