// src/lib/email/provider.ts
// ─────────────────────────────────────────────────────────────────────────────
// Provider-agnostic outbound email sending.
//
// ISS-041: replaces the old mailto:-only fallback with a real, server-side
// send. Deliberately kept provider-agnostic — everything that calls sendEmail()
// below only depends on the EmailInput/EmailResult shapes, never on Resend's
// API directly. Swapping to SMTP or SendGrid later means writing one new
// function in this file and changing EMAIL_PROVIDER; no caller needs to change.
//
// Current provider: Resend (https://resend.com), called via plain fetch() —
// no extra npm dependency required, Resend's API is a single REST endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '@/lib/logger'

export interface EmailInput {
  to: string
  subject: string
  html: string
  text: string
  // Optional PDF/attachment support for future use (e.g. invoice PDF attached
  // instead of inlined). Not required by any current caller.
  attachments?: { filename: string; content: string /* base64 */ }[]
}

export interface EmailResult {
  success: boolean
  providerMessageId?: string
  error?: string
}

const RESEND_API_URL = 'https://api.resend.com/emails'

function getFromAddress(): string {
  // EMAIL_FROM lets the user set a verified sending address/domain in Resend.
  // Falls back to Resend's own shared testing address, which works without
  // domain verification but will show "via resend.dev" to recipients.
  return process.env.EMAIL_FROM || 'BookMySpaces <onboarding@resend.dev>'
}

async function sendViaResend(input: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      }),
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      const message = typeof body?.message === 'string' ? body.message : `Resend API returned ${res.status}`
      logger.error('email-provider', 'Resend send failed', message, { to: input.to })
      return { success: false, error: message }
    }

    return { success: true, providerMessageId: typeof body?.id === 'string' ? body.id : undefined }
  } catch (err) {
    logger.error('email-provider', 'Resend request threw', err, { to: input.to })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Which provider is active. Only Resend is implemented today (per the user's
// choice); this indirection is what makes adding SMTP/SendGrid later a
// one-function change instead of a rewrite of every caller.
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  return sendViaResend(input)
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}
