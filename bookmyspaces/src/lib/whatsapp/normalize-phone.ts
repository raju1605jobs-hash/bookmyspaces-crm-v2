// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/normalize-phone.ts
// V3 Day 3 — extracted from src/lib/whatsapp.ts during WhatsApp sender
// consolidation (audit/DAY3_EXECUTION_REPORT.md). Behavior unchanged from
// the original inline implementation.
//
// Callers throughout the codebase (queue.ts's smartSend via cron/followups,
// broadcast campaigns) pass raw 10-digit Indian numbers straight from the
// `leads.phone` column with no country code. This normalization is load-
// bearing, not cosmetic — confirmed via production log samples showing
// "9051459463" being normalized to "919051459463" before every live send.
// ─────────────────────────────────────────────────────────────────────────────

// "9051459463" → "919051459463"  |  "+919051459463" → "919051459463"
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('91') && digits.length === 12
    ? digits
    : `91${digits}`
}
