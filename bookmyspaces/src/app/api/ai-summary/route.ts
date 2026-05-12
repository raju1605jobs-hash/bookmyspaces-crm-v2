export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'ai-summary',
  })
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    route: 'ai-summary',
  })
}