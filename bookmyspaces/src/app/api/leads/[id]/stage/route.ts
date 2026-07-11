// src/app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/:id/stage — update lead stage with validation
// ─────────────────────────────────────────────────────────────────────────────
// ISS-020/ISS-019 (audit/MASTER_ISSUE_REGISTER.csv): this file was previously named
// lead-stage-route.ts and was never registered as a Next.js route handler (silently
// dead). Restored under the correct App Router filename. leads.lead_stage is confirmed
// present on the live database (audit/SCHEMA_DRIFT_REPORT.md, Category C) so this is
// safe to activate now — no pending migration required.

import { NextRequest, NextResponse } from 'next/server';
import { transitionStage } from '@/modules/leads/lead-stage-manager';
import { isValidStage } from '@/modules/leads/lead-stage-manager';
import { requireAuth } from '@/lib/auth-guard';

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

    const body = await req.json() as { stage?: string; reason?: string; force?: boolean };
    const { stage, reason, force = false } = body;

    if (!stage || !isValidStage(stage)) {
      return NextResponse.json(
        { error: 'Invalid stage value', valid_stages: ['NEW','CONTACTED','QUALIFIED','NEGOTIATING','PROPOSAL_SENT','VISIT_SCHEDULED','CONFIRMED','LOST'] },
        { status: 400 }
      );
    }

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
