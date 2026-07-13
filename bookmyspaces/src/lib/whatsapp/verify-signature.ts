// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/verify-signature.ts
// Extracted, unchanged, from src/app/api/whatsapp/webhook/route.ts (ISS-004).
// Moved here so it has exactly one implementation, reusable by both the live
// webhook route and the new WhatsAppMessagingProvider adapter
// (src/lib/providers/whatsapp-provider.ts) — per "do not duplicate logic."
//
// Behavior is byte-for-byte identical to the version that was inline in the
// route file: same 3-state return, same "unconfigured" rollout behavior
// (RISK_REGISTER.md's flag-first recommendation for ISS-004), same
// timing-safe comparison. Nothing about how the webhook route handles each
// state changed — only where this function lives.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'

export function verifySignature(rawBody: string, signatureHeader: string | null): 'valid' | 'invalid' | 'unconfigured' {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) return 'unconfigured'

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return 'invalid'

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')
  const provided = signatureHeader.slice('sha256='.length)

  const expectedBuf = Buffer.from(expected, 'hex')
  const providedBuf = Buffer.from(provided, 'hex')
  if (expectedBuf.length !== providedBuf.length) return 'invalid'

  return crypto.timingSafeEqual(expectedBuf, providedBuf) ? 'valid' : 'invalid'
}
