// src/app/api/dashboard/revenue/route.ts
// GET /api/dashboard/revenue
// Returns revenue KPIs and chart data for the revenue dashboard.
// Revenue source: SUM(proposals.total_price) WHERE accepted_at IS NOT NULL
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Explicit local types for the fields we SELECT — prevents GenericStringError
// inference from the untyped Supabase client, matching the pattern in stats/route.ts.

interface LeadRow {
  status     : string | null;
  source     : string | null;
  created_at : string;
  venue      : string | null;
}

interface ProposalRow {
  status      : string | null;
  accepted_at : string | null;
  sent_at     : string | null;
  total_price : number | null;
  venue       : string | null;
}

interface BookingRow {
  booking_status : string | null;
  payment_status : string | null;
  total_amount   : number | null;
}

// ─── Response shape ───────────────────────────────────────────────────────────

export interface RevenueSummary {
  leads: {
    total          : number;
    new_this_month : number;
    by_status      : Array<{ status: string; count: number }>;
    by_source      : Array<{ source: string; count: number }>;
  };
  proposals: {
    total          : number;
    sent           : number;
    accepted       : number;
    rejected       : number;
    acceptance_pct : number;
  };
  bookings: {
    total     : number;
    confirmed : number;
    completed : number;
    cancelled : number;
  };
  revenue: {
    total      : number;
    this_month : number;
    last_month : number;
    avg_value  : number;
    deal_count : number;
  };
  charts: {
    revenue_by_month  : Array<{ month: string; revenue: number; deals: number }>;
    leads_by_source   : Array<{ source: string; count: number }>;
    venue_performance : Array<{ venue: string; revenue: number; deals: number }>;
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const db  = getSupabaseAdmin();
    const now = new Date();

    // Month boundaries — used for this_month / last_month slices
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
    const sixMonthsAgo   = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    // ── Fetch all three tables in parallel ────────────────────────────────────
    const [leadsResult, proposalsResult, bookingsResult] = await Promise.all([
      db.from('leads').select('status, source, created_at, venue'),
      db.from('proposals').select('status, accepted_at, sent_at, total_price, venue'),
      db.from('bookings').select('booking_status, payment_status, total_amount'),
    ]);

    // Surface any Supabase error immediately
    if (leadsResult.error) {
      console.error('[API /dashboard/revenue] leads error:', leadsResult.error.message);
      return NextResponse.json({ error: leadsResult.error.message }, { status: 500 });
    }
    if (proposalsResult.error) {
      console.error('[API /dashboard/revenue] proposals error:', proposalsResult.error.message);
      return NextResponse.json({ error: proposalsResult.error.message }, { status: 500 });
    }
    if (bookingsResult.error) {
      console.error('[API /dashboard/revenue] bookings error:', bookingsResult.error.message);
      return NextResponse.json({ error: bookingsResult.error.message }, { status: 500 });
    }

    // Cast through unknown → typed row arrays (same pattern as stats/route.ts)
    const leads    = (leadsResult.data    ?? []) as unknown as LeadRow[];
    const proposals = (proposalsResult.data ?? []) as unknown as ProposalRow[];
    const bookings  = (bookingsResult.data  ?? []) as unknown as BookingRow[];

    // ── Leads KPIs ────────────────────────────────────────────────────────────
    const newThisMonth = leads.filter((l) => l.created_at >= thisMonthStart).length;

    // Count by status
    const statusMap: Record<string, number> = {};
    for (const l of leads) {
      const s = l.status ?? 'unknown';
      statusMap[s] = (statusMap[s] ?? 0) + 1;
    }
    const byStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // Count by source
    const sourceMap: Record<string, number> = {};
    for (const l of leads) {
      const s = l.source ?? 'other';
      sourceMap[s] = (sourceMap[s] ?? 0) + 1;
    }
    const bySource = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // ── Proposal KPIs ─────────────────────────────────────────────────────────
    // Sent: sent_at IS NOT NULL
    const sentProposals     = proposals.filter((p) => p.sent_at !== null);
    // Accepted: accepted_at IS NOT NULL  (revenue source)
    const acceptedProposals = proposals.filter((p) => p.accepted_at !== null);
    // Rejected: status === 'rejected'
    const rejectedProposals = proposals.filter((p) => p.status === 'rejected');

    const decisioned    = acceptedProposals.length + rejectedProposals.length;
    const acceptancePct = decisioned > 0
      ? Math.round((acceptedProposals.length / decisioned) * 100)
      : 0;

    // ── Booking KPIs (uses booking_status per schema) ─────────────────────────
    const confirmedBookings = bookings.filter((b) => b.booking_status === 'confirmed');
    const completedBookings = bookings.filter((b) => b.booking_status === 'completed');
    const cancelledBookings = bookings.filter((b) => b.booking_status === 'cancelled');

    // ── Revenue KPIs ──────────────────────────────────────────────────────────
    // Source of truth: SUM(total_price) WHERE accepted_at IS NOT NULL
    const totalRevenue = acceptedProposals.reduce(
      (sum, p) => sum + (Number(p.total_price) || 0), 0
    );

    const thisMonthRevenue = acceptedProposals
      .filter((p) => p.accepted_at! >= thisMonthStart)
      .reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);

    const lastMonthRevenue = acceptedProposals
      .filter((p) => p.accepted_at! >= lastMonthStart && p.accepted_at! <= lastMonthEnd)
      .reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);

    const avgValue = acceptedProposals.length > 0
      ? Math.round(totalRevenue / acceptedProposals.length)
      : 0;

    // ── Charts ────────────────────────────────────────────────────────────────

    // Revenue by month — last 6 months, fill gaps with zero
    type MonthBucket = { revenue: number; deals: number };
    const monthBuckets: Record<string, MonthBucket> = {};

    for (const p of acceptedProposals) {
      if (!p.accepted_at || p.accepted_at < sixMonthsAgo) continue;
      const d   = new Date(p.accepted_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthBuckets[key]) monthBuckets[key] = { revenue: 0, deals: 0 };
      monthBuckets[key].revenue += Number(p.total_price) || 0;
      monthBuckets[key].deals   += 1;
    }

    const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
      return {
        month  : lbl,
        revenue: monthBuckets[key]?.revenue ?? 0,
        deals  : monthBuckets[key]?.deals   ?? 0,
      };
    });

    // Venue performance — group accepted proposals by venue
    const venueMap: Record<string, { revenue: number; deals: number }> = {};
    for (const p of acceptedProposals) {
      const v = p.venue ?? 'Unknown';
      if (!venueMap[v]) venueMap[v] = { revenue: 0, deals: 0 };
      venueMap[v].revenue += Number(p.total_price) || 0;
      venueMap[v].deals   += 1;
    }
    const venuePerformance = Object.entries(venueMap)
      .map(([venue, d]) => ({ venue, revenue: d.revenue, deals: d.deals }))
      .sort((a, b) => b.revenue - a.revenue);

    // ── Build response ────────────────────────────────────────────────────────
    const summary: RevenueSummary = {
      leads: {
        total          : leads.length,
        new_this_month : newThisMonth,
        by_status      : byStatus,
        by_source      : bySource,
      },
      proposals: {
        total          : proposals.length,
        sent           : sentProposals.length,
        accepted       : acceptedProposals.length,
        rejected       : rejectedProposals.length,
        acceptance_pct : acceptancePct,
      },
      bookings: {
        total    : bookings.length,
        confirmed: confirmedBookings.length,
        completed: completedBookings.length,
        cancelled: cancelledBookings.length,
      },
      revenue: {
        total      : totalRevenue,
        this_month : thisMonthRevenue,
        last_month : lastMonthRevenue,
        avg_value  : avgValue,
        deal_count : acceptedProposals.length,
      },
      charts: {
        revenue_by_month  : revenueByMonth,
        leads_by_source   : bySource,
        venue_performance : venuePerformance,
      },
    };

    return NextResponse.json(summary);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /dashboard/revenue] Unexpected error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
