// src/app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/:id/stage — update lead stage with validation
// ─────────────────────────────────────────────────────────────────────────────
// ISS-020/ISS-019 (audit/MASTER_ISSUE_REGISTER.csv): this file was previously named
// lead-stage-route.ts and was never registered as a Next.js route handler (silently
// dead). Restored under the correct App Router filename. leads.lead_stage is confirmed
// present on the live database (audit/SCHEMA_DRIFT_REPORT.md, Category C) so this is
// safe to activate now — no pending migration required.
//
// ISS-005: body now validated with leadStageBodySchema (src/lib/validation.ts)
// before the hand-rolled isValidStage() check — gives a consistent {error,
// issues[]} 400 shape instead of the route's own ad-hoc error object.

import { NextRequest, NextResponse } from 'next/server';
import { transitionStage } from '@/modules/leads/lead-stage-manager';
import { requireAuth } from '@/lib/auth-guard';
import { parseBody, leadStageBodySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  try {
    const leadId = params.id;
    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID required' }, { status: 400 });
    }

    const parsed = await parseBody(req, leadStageBodySchema);
    if (!parsed.ok) return parsed.response;
    const { stage, reason, force = false } = parsed.data;

    const result = await transitionStage({
      leadId,
      toStage     : stage,
      reason      : reason ?? 'manual update',
      performedBy : 'admin',
      force,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      success       : true,
      previous_stage: result.previousStage,
      new_stage     : result.newStage,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
