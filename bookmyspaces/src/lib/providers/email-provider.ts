// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/providers/email-provider.ts
// V3 Day 2 — Provider Framework integration
//
// Implements EmailProvider (src/lib/providers/types.ts) by delegating to the
// existing, live src/lib/email/provider.ts's sendEmail(). Pure adapter — the
// actual Resend API call, from-address logic, and error handling all stay in
// that file, unchanged. src/lib/email/provider.ts's own header already
// describes itself as "provider-agnostic" for exactly this reason; this
// adapter is the shape that description was pointing at.
// ─────────────────────────────────────────────────────────────────────────────

import { sendEmail, isEmailProviderConfigured } from '@/lib/email/provider'
import type { EmailMessage, EmailProvider, ProviderResponse } from './types'

export const resendEmailProvider: EmailProvider = {
  name: 'resend',

  async send(message: EmailMessage): Promise<ProviderResponse<{ providerMessageId: string }>> {
    if (!isEmailProviderConfigured()) {
      return {
        ok: false,
        error: { code: 'not_configured', message: 'RESEND_API_KEY not configured', retryable: false },
      }
    }

    const result = await sendEmail({
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? '',
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === 'string' ? a.content : a.content.toString('base64'),
      })),
    })

    if (!result.success) {
      return {
        ok: false,
        error: { code: 'send_failed', message: result.error ?? 'Email send failed', retryable: true },
      }
    }

    return { ok: true, data: { providerMessageId: result.providerMessageId ?? 'unknown' } }
  },
}
