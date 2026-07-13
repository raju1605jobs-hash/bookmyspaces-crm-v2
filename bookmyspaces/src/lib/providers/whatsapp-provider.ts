// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/providers/whatsapp-provider.ts
// V3 Day 2 — Provider Framework integration
//
// Implements MessagingProvider (src/lib/providers/types.ts) by delegating to
// the existing, live src/lib/whatsapp.ts functions. This is a pure adapter:
// no Meta API call, retry logic, or logging behavior is reimplemented here —
// every method body is a direct pass-through. Calling this adapter has the
// exact same observable effect as calling sendWhatsAppMessage/
// sendTemplateMessage directly.
//
// IMPORTANT — found during this integration, not previously documented:
// this codebase has TWO parallel WhatsApp senders:
//   1. src/lib/whatsapp.ts (sendWhatsAppMessage / sendTemplateMessage) —
//      used by the webhook route's auto-reply, the campaigns route, and
//      queue.ts's smartSend. Returns boolean. No per-message DB log, no
//      retry loop.
//   2. src/lib/whatsapp/send-message.ts (sendWhatsAppText /
//      sendWhatsAppTemplate) — used only by auto-responder.ts. Returns a
//      result object, retries failed sends, logs every attempt to the
//      whatsapp_messages table.
// This adapter wraps (1), the more widely-used of the two, because
// unifying them is a real architectural decision (which one becomes "the"
// implementation, and what happens to the retry/logging behavior only (2)
// has) that affects a live production path this sandbox cannot test —
// exactly the kind of call this session's rules say to flag, not decide
// silently. See audit/DAY2_EXECUTION_REPORT.md.
// ─────────────────────────────────────────────────────────────────────────────

import { sendWhatsAppMessage, sendTemplateMessage } from '@/lib/whatsapp'
import { verifySignature } from '@/lib/whatsapp/verify-signature'
import type { MessagingProvider, OutboundMessage, ProviderResponse, SendResult } from './types'

export const whatsAppProvider: MessagingProvider = {
  channel: 'whatsapp',

  async send(message: OutboundMessage): Promise<ProviderResponse<SendResult>> {
    if (message.channel !== 'whatsapp') {
      return {
        ok: false,
        error: { code: 'wrong_provider', message: `whatsAppProvider cannot send on channel "${message.channel}"`, retryable: false },
      }
    }

    const success = message.templateName
      ? await sendTemplateMessage(
          message.recipientId,
          message.templateName,
          message.templateParams
            ? Object.entries(message.templateParams).map(([name, value]) => ({ name, value }))
            : []
        )
      : await sendWhatsAppMessage(message.recipientId, message.text ?? '')

    if (!success) {
      // sendWhatsAppMessage/sendTemplateMessage log the real failure reason
      // internally (console.error + logger.error) and only return a
      // boolean — this adapter cannot surface a more specific error without
      // changing those functions' return type, which would be an existing-
      // module change out of scope for a pure adapter.
      return {
        ok: false,
        error: { code: 'send_failed', message: 'WhatsApp send failed — see server logs for detail', retryable: true },
      }
    }

    return {
      ok: true,
      data: {
        // sendWhatsAppMessage/sendTemplateMessage don't return Meta's message
        // id today (unlike send-message.ts's sendWhatsAppText, which does) —
        // surfaced honestly as unknown rather than fabricating one.
        providerMessageId: 'unknown',
        channel: 'whatsapp',
        status: 'sent',
      },
    }
  },

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    const signatureHeader = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'] ?? null
    return verifySignature(rawBody, signatureHeader) === 'valid'
  },
}
