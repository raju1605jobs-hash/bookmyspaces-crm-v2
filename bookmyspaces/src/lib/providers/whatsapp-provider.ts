// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/providers/whatsapp-provider.ts
// V3 Day 2 — Provider Framework integration
// V3 Day 3 — updated to delegate to the consolidated sender
// (src/lib/whatsapp/send-message.ts) after the WhatsApp sender consolidation
// decided by the Product Owner (audit/DAY3_EXECUTION_REPORT.md). The
// duplicate-sender situation flagged on Day 2 is resolved: send-message.ts
// is now the only implementation, with retry logic and whatsapp_messages
// logging on every call site, including this adapter's.
//
// Still a pure adapter: no Meta API call or retry logic is reimplemented
// here — every method body delegates to the consolidated sender.
// ─────────────────────────────────────────────────────────────────────────────

import { sendWhatsAppText, sendWhatsAppTemplateSimple } from '@/lib/whatsapp/send-message'
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

    const result = message.templateName
      ? await sendWhatsAppTemplateSimple(
          message.recipientId,
          message.templateName,
          message.templateParams
            ? Object.entries(message.templateParams).map(([name, value]) => ({ name, value }))
            : []
        )
      : await sendWhatsAppText(message.recipientId, message.text ?? '')

    if (!result.success) {
      return {
        ok: false,
        error: { code: 'send_failed', message: result.error ?? 'WhatsApp send failed — see server logs for detail', retryable: true },
      }
    }

    return {
      ok: true,
      data: {
        providerMessageId: result.waMessageId ?? 'unknown',
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
