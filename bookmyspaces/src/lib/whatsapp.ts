// ═══════════════════════════════════════════════════════════════
// WHATSAPP INTEGRATION LAYER (legacy) — V3 Day 3 consolidation
//
// This file previously contained sendWhatsAppMessage, sendTemplateMessage,
// sendBroadcastCampaign, normalizePhone, and isMetaConfigured. As of
// 2026-07-13 (Product Owner decision, audit/DAY3_EXECUTION_REPORT.md),
// those have been consolidated into src/lib/whatsapp/send-message.ts (the
// implementation that already had retry logic and whatsapp_messages
// logging — see that file's header for the full rationale). All former
// call sites (webhook route, campaigns route, queue.ts's smartSend, the
// Provider Framework's whatsAppProvider adapter) now import from there.
//
// New locations:
//   - sendWhatsAppMessage      -> sendWhatsAppText          (send-message.ts)
//   - sendTemplateMessage      -> sendWhatsAppTemplateSimple (send-message.ts)
//   - sendBroadcastCampaign    -> sendBroadcastCampaign      (send-message.ts)
//   - normalizePhone           -> normalizePhone      (whatsapp/normalize-phone.ts)
//   - isMetaConfigured         -> isMetaConfigured    (whatsapp/meta-configured.ts)
//
// extractMessageText below has no current call sites (confirmed via
// codebase search during this consolidation) but is kept — it's a small,
// side-effect-free utility that a future inbound-message handler will
// plausibly want, and deleting unused-but-harmless exports wasn't part of
// this session's scoped task.
// ═══════════════════════════════════════════════════════════════

// ─── UTILITY: EXTRACT TEXT FROM INCOMING MESSAGE ──────────────
export function extractMessageText(msg: {
  type:         string
  text?:        { body: string }
  data?:        { text?: string; caption?: string }
  listReply?:   { title: string }
  buttonReply?: { title: string }
}): string {
  if (msg.type === 'text' && msg.text?.body) return msg.text.body
  if (msg.data?.text)                         return msg.data.text
  if (msg.data?.caption)                      return msg.data.caption
  if (msg.listReply?.title)                   return msg.listReply.title
  if (msg.buttonReply?.title)                 return msg.buttonReply.title
  return ''
}
