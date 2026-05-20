// src/lib/lead-scorer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure lead scoring engine for BookMySpaces CRM.
// No database calls — accepts a lead snapshot, returns a score result.
// Called from the WhatsApp webhook after lead upsert, and from any API route.
//
// Scoring model (total 100 points):
//   Event type      : 0–30 pts
//   Guest count     : 0–25 pts
//   Date urgency    : 0–20 pts
//   Budget signal   : 0–15 pts
//   Source quality  : 0–10 pts
//
// Temperature thresholds:
//   HOT  : score >= 70
//   WARM : score >= 40
//   COLD : score <  40
//
// Urgency thresholds (date-driven):
//   HIGH   : event within 30 days OR score >= 80
//   MEDIUM : event within 90 days OR score >= 55
//   LOW    : everything else
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadScoringInput {
  // Identity
  name         ?: string | null;
  phone        ?: string | null;
  email        ?: string | null;

  // Event
  event_type   ?: string | null;   // 'wedding' | 'corporate' | 'birthday' | etc.
  event_date   ?: string | null;   // ISO date string or any parseable date
  guest_count  ?: number | null;
  budget       ?: string | null;   // free-text, e.g. "50000" or "5 lakh"

  // Source
  source       ?: string | null;   // 'whatsapp' | 'website' | 'referral' | etc.

  // Existing tags to merge with new auto-tags
  existing_tags?: string[];
}

export interface ScoreBreakdown {
  // Per-component scores
  event_type_score  : number;
  guest_score       : number;
  date_score        : number;
  budget_score      : number;
  source_score      : number;
  // Human-readable explanation of every point allocation
  reasoning         : string[];
  // Snapshot of key values at scoring time (for auditability)
  event_type        : string;
  guest_count       : number;
  estimated_revenue : number;
  urgency_level     : "HIGH" | "MEDIUM" | "LOW";
  generated_at      : string;   // ISO timestamp
}

export interface LeadScoringResult {
  ai_score          : number;           // 0–100, maps to existing leads.ai_score column
  lead_temperature  : "HOT" | "WARM" | "COLD";
  urgency_level     : "HIGH" | "MEDIUM" | "LOW";
  estimated_revenue : number;           // INR
  tags              : string[];         // merged: existing + auto-generated
  score_breakdown   : ScoreBreakdown;
  scored_at         : string;           // ISO timestamp
}

// ─── Event type scores ────────────────────────────────────────────────────────
const EVENT_TYPE_SCORES: Record<string, number> = {
  // Tier 1 — 30 pts (highest revenue, multi-day, full venue)
  wedding             : 30,
  reception           : 28,
  engagement          : 25,

  // Tier 2 — 20 pts
  corporate           : 20,
  conference          : 20,
  seminar             : 18,
  product_launch      : 20,

  // Tier 3 — 15 pts
  birthday            : 15,
  anniversary         : 15,
  baby_shower         : 12,
  farewell            : 12,

  // Tier 4 — 10 pts
  private_dinner      : 10,
  get_together        : 10,
  reunion             : 10,
  photoshoot          : 8,

  // Default for unknown types
  other               : 8,
};

// ─── Budget parser — converts free-text to INR number ────────────────────────
export function parseBudget(raw: string | null | undefined): number {
  if (!raw) return 0;

  const lower = raw.toLowerCase().replace(/,/g, "").trim();

  // Handle "X lakh" / "X lac" patterns
  const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|l\b)/);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100_000);

  // Handle "X k" patterns
  const kMatch = lower.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);

  // Handle plain numbers
  const numMatch = lower.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    // Heuristic: if number < 1000, assume it's in thousands (e.g. user typed "50" meaning 50k)
    return n < 1000 ? Math.round(n * 1_000) : Math.round(n);
  }

  return 0;
}

// ─── Days until event ─────────────────────────────────────────────────────────
function daysUntilEvent(eventDate: string | null | undefined): number | null {
  if (!eventDate) return null;
  const parsed = new Date(eventDate);
  if (isNaN(parsed.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Normalise event type string ──────────────────────────────────────────────
function normaliseEventType(raw: string | null | undefined): string {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();

  // Alias mapping
  const aliases: Record<string, string> = {
    "birthday party"      : "birthday",
    "bday"                : "birthday",
    "b'day"               : "birthday",
    "anniv"               : "anniversary",
    "corp"                : "corporate",
    "office party"        : "corporate",
    "team outing"         : "corporate",
    "product launch"      : "product_launch",
    "baby shower"         : "baby_shower",
    "get together"        : "get_together",
    "photo shoot"         : "photoshoot",
    "private dinner"      : "private_dinner",
    "sangeet"             : "wedding",
    "mehendi"             : "wedding",
    "haldi"               : "wedding",
    "shaadi"              : "wedding",
    "biye"                : "wedding",      // Bengali
    "anusthan"            : "wedding",      // Bengali
  };

  if (aliases[lower]) return aliases[lower];
  if (EVENT_TYPE_SCORES[lower] !== undefined) return lower;

  // Fuzzy partial match
  for (const key of Object.keys(EVENT_TYPE_SCORES)) {
    if (lower.includes(key) || key.includes(lower)) return key;
  }

  return "other";
}

// ─── Main scoring function ────────────────────────────────────────────────────
export function scoreLead(input: LeadScoringInput): LeadScoringResult {
  // ── Outer safety wrapper ──────────────────────────────────────────────────
  // scoreLead must NEVER throw — webhook catches are a last resort, not a plan.
  // If any internal logic errors, return a safe minimal result rather than crash.
  try {
    return _scoreLeadInternal(input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ai_score          : 5,
      lead_temperature  : "COLD",
      urgency_level     : "LOW",
      estimated_revenue : 0,
      tags              : input.existing_tags ?? [],
      score_breakdown   : {
        event_type_score  : 0,
        guest_score       : 0,
        date_score        : 0,
        budget_score      : 0,
        source_score      : 0,
        reasoning         : [`[SCORING ERROR] ${message} — safe fallback returned`],
        event_type        : input.event_type ?? "unknown",
        guest_count       : input.guest_count ?? 0,
        estimated_revenue : 0,
        urgency_level     : "LOW",
        generated_at      : new Date().toISOString(),
      },
      scored_at : new Date().toISOString(),
    };
  }
}

// ─── Internal implementation (called only from scoreLead) ─────────────────────
function _scoreLeadInternal(input: LeadScoringInput): LeadScoringResult {
  const reasoning: string[] = [];
  const generatedAt = new Date().toISOString();

  // ── Event type score (0–30) ───────────────────────────────────────────────
  const normType        = normaliseEventType(input.event_type);
  const eventTypeScore  = EVENT_TYPE_SCORES[normType] ?? 8;
  reasoning.push(`+${eventTypeScore} event type "${normType}" (max 30)`);

  // ── Guest count score (0–25) ──────────────────────────────────────────────
  const guests = input.guest_count ?? 0;
  let guestScore = 0;
  if (guests >= 100)      { guestScore = 25; reasoning.push(`+25 guest count ${guests} (≥100)`); }
  else if (guests >= 70)  { guestScore = 20; reasoning.push(`+20 guest count ${guests} (70–99)`); }
  else if (guests >= 40)  { guestScore = 15; reasoning.push(`+15 guest count ${guests} (40–69)`); }
  else if (guests >= 20)  { guestScore = 10; reasoning.push(`+10 guest count ${guests} (20–39)`); }
  else if (guests >= 1)   { guestScore =  5; reasoning.push(`+5 guest count ${guests} (<20)`); }
  else                    {                  reasoning.push(`+0 no guest count provided`); }

  // ── Date urgency score (0–20) ─────────────────────────────────────────────
  const days = daysUntilEvent(input.event_date);
  let dateScore = 0;
  if (days === null) {
    dateScore = 5;
    reasoning.push("+5 no event date provided (default)");
  } else if (days < 0) {
    dateScore = 0;
    reasoning.push(`+0 event date is in the past (${Math.abs(days)} days ago)`);
  } else if (days <= 14) {
    dateScore = 20;
    reasoning.push(`+20 urgent booking timeline — event in ${days} days (≤14)`);
  } else if (days <= 30) {
    dateScore = 18;
    reasoning.push(`+18 event in ${days} days (≤30)`);
  } else if (days <= 60) {
    dateScore = 14;
    reasoning.push(`+14 event in ${days} days (≤60)`);
  } else if (days <= 90) {
    dateScore = 10;
    reasoning.push(`+10 event in ${days} days (≤90)`);
  } else if (days <= 180) {
    dateScore = 6;
    reasoning.push(`+6 event in ${days} days (≤180)`);
  } else {
    dateScore = 3;
    reasoning.push(`+3 event in ${days} days (>180)`);
  }

  // Weekend bonus (+3 if event falls on Sat/Sun)
  if (input.event_date) {
    const d = new Date(input.event_date);
    if (!isNaN(d.getTime()) && (d.getDay() === 0 || d.getDay() === 6)) {
      dateScore = Math.min(20, dateScore + 3);
      reasoning.push("+3 weekend event bonus");
    }
  }

  // ── Budget score (0–15) ───────────────────────────────────────────────────
  const budgetINR = parseBudget(input.budget);
  let budgetScore = 0;
  if (budgetINR >= 200_000)     { budgetScore = 15; reasoning.push(`+15 budget ₹${budgetINR.toLocaleString("en-IN")} (≥2L)`); }
  else if (budgetINR >= 100_000){ budgetScore = 12; reasoning.push(`+12 budget ₹${budgetINR.toLocaleString("en-IN")} (1–2L)`); }
  else if (budgetINR >= 50_000) { budgetScore =  9; reasoning.push(`+9 budget ₹${budgetINR.toLocaleString("en-IN")} (50k–1L)`); }
  else if (budgetINR >= 20_000) { budgetScore =  6; reasoning.push(`+6 budget ₹${budgetINR.toLocaleString("en-IN")} (20k–50k)`); }
  else if (budgetINR > 0)       { budgetScore =  3; reasoning.push(`+3 budget ₹${budgetINR.toLocaleString("en-IN")} (<20k)`); }
  else                          {                   reasoning.push("+0 no budget provided"); }

  // ── Source score (0–10) ───────────────────────────────────────────────────
  const sourceScores: Record<string, number> = {
    referral  : 10,
    whatsapp  : 8,
    instagram : 7,
    website   : 6,
    justdial  : 5,
    other     : 4,
  };
  const sourceScore = sourceScores[input.source?.toLowerCase() ?? "other"] ?? 4;
  reasoning.push(`+${sourceScore} source "${input.source ?? "other"}"`);

  // ── Total score — CLAMPED to 0–100 ───────────────────────────────────────
  // Clamping happens here, after ALL component scores are summed, and before
  // any downstream logic uses the score. This is the single authoritative clamp.
  const rawScore  = eventTypeScore + guestScore + dateScore + budgetScore + sourceScore;
  const leadScore = Math.max(0, Math.min(100, rawScore));   // ← explicit clamp
  reasoning.push(`Total: ${rawScore} → clamped to ${leadScore}/100`);

  // ── Temperature ───────────────────────────────────────────────────────────
  const leadTemperature: "HOT" | "WARM" | "COLD" =
    leadScore >= 70 ? "HOT"  :
    leadScore >= 40 ? "WARM" :
                      "COLD";

  // ── Urgency ───────────────────────────────────────────────────────────────
  const urgencyLevel: "HIGH" | "MEDIUM" | "LOW" =
    (days !== null && days <= 30) || leadScore >= 80 ? "HIGH"   :
    (days !== null && days <= 90) || leadScore >= 55 ? "MEDIUM" :
                                                       "LOW";

  // ── Estimated revenue ─────────────────────────────────────────────────────
  // Use provided budget if available; otherwise estimate from event type × guests.
  let estimatedRevenue = budgetINR;
  if (estimatedRevenue === 0) {
    const perHeadRates: Record<string, number> = {
      wedding    : 2500,
      reception  : 2000,
      engagement : 1800,
      corporate  : 1500,
      birthday   : 1200,
      anniversary: 1500,
      other      : 1000,
    };
    const perHead = perHeadRates[normType] ?? 1000;
    const g       = guests > 0 ? guests : 30;   // assume 30 if unknown
    estimatedRevenue = perHead * g;
    reasoning.push(`Estimated revenue ₹${perHead}/head × ${g} guests = ₹${estimatedRevenue.toLocaleString("en-IN")}`);
  }

  // ── Auto tags ─────────────────────────────────────────────────────────────
  const autoTags: string[] = [];

  if (leadTemperature === "HOT")       autoTags.push("HOT");
  else if (leadTemperature === "WARM") autoTags.push("WARM");
  else                                 autoTags.push("COLD");

  if (urgencyLevel === "HIGH")         autoTags.push("FOLLOW_UP");
  if (days !== null && days <= 14)     autoTags.push("URGENT");
  if (estimatedRevenue >= 150_000)     autoTags.push("VIP");
  if (normType === "wedding")          autoTags.push("WEDDING");
  if (normType === "corporate")        autoTags.push("CORPORATE");
  if (guests >= 100)                   autoTags.push("LARGE_EVENT");

  // ── Historical HOT / VIP preservation ────────────────────────────────────
  // Once a lead has been marked VIP, that status is NEVER removed automatically.
  // Temperature (HOT/WARM/COLD) IS replaced on every rescore — old temperature
  // tags are stripped first so a lead can never hold two temperatures at once.
  const existingTags  = input.existing_tags ?? [];
  const wasVip        = existingTags.includes("VIP");

  if (wasVip && !autoTags.includes("VIP")) {
    autoTags.push("VIP");
    reasoning.push("VIP tag preserved from previous scoring (not downgraded)");
  }

  // ── Temperature tag deduplication (THE FIX) ───────────────────────────────
  // Strip ALL existing temperature tags from existingTags before merging.
  // This guarantees the final array holds exactly ONE temperature tag —
  // the one from the current rescore — regardless of what was stored before.
  //
  //   OLD: ["COLD", "VIP", "WEDDING"]  →  cleanedExistingTags: ["VIP", "WEDDING"]
  //   autoTags: ["HOT", "VIP", "WEDDING"]
  //   finalTags: ["VIP", "WEDDING", "HOT"]   ← no duplicate, no stale COLD
  const temperatureTags = ["HOT", "WARM", "COLD"];
  const cleanedExistingTags = existingTags.filter(
    (tag) => !temperatureTags.includes(tag)
  );

  // Merge: cleaned history + new auto-tags, deduplicated
  const mergedTags = Array.from(new Set([...cleanedExistingTags, ...autoTags]));

  // ── Build final score_breakdown with all required fields ──────────────────
  const scoreBreakdown: ScoreBreakdown = {
    event_type_score  : eventTypeScore,
    guest_score       : guestScore,
    date_score        : dateScore,
    budget_score      : budgetScore,
    source_score      : sourceScore,
    reasoning,
    event_type        : normType,
    guest_count       : guests,
    estimated_revenue : estimatedRevenue,
    urgency_level     : urgencyLevel,
    generated_at      : generatedAt,
  };

  return {
    ai_score          : leadScore,
    lead_temperature  : leadTemperature,
    urgency_level     : urgencyLevel,
    estimated_revenue : estimatedRevenue,
    tags              : mergedTags,
    score_breakdown   : scoreBreakdown,
    scored_at         : generatedAt,
  };
}
