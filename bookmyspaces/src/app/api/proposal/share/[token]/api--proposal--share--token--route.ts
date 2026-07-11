// SUPERSEDED (ISS-020, 2026-07-11): this file's content was copied to the correctly
// named `route.ts` in this same folder, which is what Next.js actually registers.
// This file is never loaded by the router (wrong filename) and can be deleted —
// left in place only because this sandbox's mounted filesystem does not permit
// file deletion. Please `rm` this file from your own machine.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabaseAdmin = getSupabaseAdmin()
  const { token } = params

  if (!token || token.length < 16) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const { data: proposal, error } = await supabaseAdmin
    .from('proposals')
    .select('id,proposal_number,client_name,client_phone,client_email,event_type,event_date,event_time,guest_count,venue,package_name,base_price,addons,discount_amount,discount_reason,total_price,advance_required,special_requirements,inclusions,ai_cover_note,notes,status,share_token,expires_at,created_at')
    .eq('share_token', token)
    .single()

  if (error || !proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })

  return NextResponse.json({ proposal })
}
