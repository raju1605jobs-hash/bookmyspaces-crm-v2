// SUPERSEDED (ISS-020, 2026-07-11): this file's content was copied to the correctly
// named `route.ts` in this same folder, which is what Next.js actually registers.
// This file is never loaded by the router (wrong filename) and can be deleted —
// left in place only because this sandbox's mounted filesystem does not permit
// file deletion. Please `rm` this file from your own machine.
// ─────────────────────────────────────────────────────────────────────────────
// src/app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/:id/stage — update lead stage with validation
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { transitionStage } from '@/modules/leads/lead-stage-manager';
import { isValidStage } from '@/modules/leads/lead-stage-manager';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
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
