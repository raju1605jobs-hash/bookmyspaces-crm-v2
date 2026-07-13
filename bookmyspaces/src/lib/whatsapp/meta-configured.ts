// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/meta-configured.ts
// V3 Day 3 — extracted from src/lib/whatsapp.ts during WhatsApp sender
// consolidation (audit/DAY3_EXECUTION_REPORT.md). Behavior unchanged: same
// two env vars checked, same boolean result. Logging trimmed to omit token
// length/prefix — that level of detail is what ended up in commit 43b6a15's
// leaked Vercel logs; the check itself doesn't need to log it to be useful.
// ─────────────────────────────────────────────────────────────────────────────

export function isMetaConfigured(): boolean {
  const token    = (process.env.WHATSAPP_ACCESS_TOKEN    ?? '').trim()
  const numberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()

  if (!token)    console.warn('[WhatsApp] WHATSAPP_ACCESS_TOKEN is not set or empty')
  if (!numberId) console.warn('[WhatsApp] WHATSAPP_PHONE_NUMBER_ID is not set or empty')

  return !!(token && numberId)
}
