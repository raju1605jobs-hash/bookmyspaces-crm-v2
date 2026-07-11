// ISS-020 (audit/MASTER_ISSUE_REGISTER.csv): this file was previously named
// api--proposal--share--token--route.ts and was never registered as a Next.js route
// (silently dead). Restored under the correct App Router filename. The live share page
// (src/app/(crm)/proposals/share/[token]/page.tsx) currently bypasses this route entirely
// and queries Supabase directly client-side using the anon key, gated by the "public
// share-token read" RLS policy already on `proposals` (audit/LIVE_SCHEMA_AUDIT.md) — so
// activating this route does not expose any data that isn't already reachable the same
// way today; it just gives server-side callers (and any future non-browser client) a
// working endpoint too.
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
