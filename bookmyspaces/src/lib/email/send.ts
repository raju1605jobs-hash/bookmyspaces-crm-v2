// src/lib/email/send.ts
// ─────────────────────────────────────────────────────────────────────────────
// High-level "send and log" wrapper. Every route in the app that wants to send
// an email should call sendTemplatedEmail() rather than talking to the
// provider or the email_log table directly — this is the one place that
// guarantees every attempt (success or failure) gets logged.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { sendEmail, isEmailProviderConfigured, type EmailResult } from './provider'
import {
  proposalEmail, invoiceEmail, paymentReminderEmail, followUpEmail, bookingConfirmationEmail,
  type ProposalEmailData, type InvoiceEmailData, type PaymentReminderEmailData,
  type FollowUpEmailData, type BookingConfirmationEmailData,
} from './templates'

export type EmailTemplateType = 'proposal' | 'invoice' | 'payment_reminder' | 'follow_up' | 'booking_confirmation'

interface SendTemplatedEmailArgs {
  to: string
  relatedEntityType?: 'lead' | 'proposal'
  relatedEntityId?: string
  metadata?: Record<string, unknown>
}

export interface SendTemplatedEmailResult extends EmailResult {
  logged: boolean
  // True when no email provider is configured at all — callers can use this
  // to fall back to a mailto: link instead of failing outright, matching how
  // this app already handles other optional integrations (e.g. WHATSAPP_APP_SECRET).
  providerNotConfigured: boolean
}

async function logAttempt(args: {
  to: string
  from: string
  subject: string
  templateType: EmailTemplateType
  relatedEntityType?: 'lead' | 'proposal'
  relatedEntityId?: string
  provider: string
  status: 'sent' | 'failed'
  providerMessageId?: string
  errorMessage?: string
  metadata?: Record<string, unknown>
}): Promise<boolean> {
  try {
    const db = getSupabaseAdmin()
    const { error } = await db.from('email_log').insert({
      to_email: args.to,
      from_email: args.from,
      subject: args.subject,
      template_type: args.templateType,
      related_entity_type: args.relatedEntityType ?? null,
      related_entity_id: args.relatedEntityId ?? null,
      provider: args.provider,
      provider_message_id: args.providerMessageId ?? null,
      status: args.status,
      error_message: args.errorMessage ?? null,
      metadata: args.metadata ?? {},
      sent_at: args.status === 'sent' ? new Date().toISOString() : null,
    })
    if (error) {
      // Logging failure should never block the caller from knowing whether
      // the actual email send succeeded — just surface it separately.
      logger.error('email-send', 'Failed to write email_log row', error, { to: args.to })
      return false
    }
    return true
  } catch (err) {
    logger.error('email-send', 'email_log insert threw', err, { to: args.to })
    return false
  }
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'BookMySpaces <onboarding@resend.dev>'
}

async function sendAndLog(
  templateType: EmailTemplateType,
  to: string,
  rendered: { subject: string; html: string; text: string },
  extra: Pick<SendTemplatedEmailArgs, 'relatedEntityType' | 'relatedEntityId' | 'metadata'>
): Promise<SendTemplatedEmailResult> {
  if (!isEmailProviderConfigured()) {
    return { success: false, logged: false, providerNotConfigured: true, error: 'No email provider configured' }
  }

  const from = getFromAddress()
  const result = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text })

  const logged = await logAttempt({
    to,
    from,
    subject: rendered.subject,
    templateType,
    relatedEntityType: extra.relatedEntityType,
    relatedEntityId: extra.relatedEntityId,
    provider: 'resend',
    status: result.success ? 'sent' : 'failed',
    providerMessageId: result.providerMessageId,
    errorMessage: result.error,
    metadata: extra.metadata,
  })

  return { ...result, logged, providerNotConfigured: false }
}

// ─── Public functions — one per template type ─────────────────────────────

export async function sendProposalEmail(
  to: string, data: ProposalEmailData, extra: SendTemplatedEmailArgs = { to }
): Promise<SendTemplatedEmailResult> {
  return sendAndLog('proposal', to, proposalEmail(data), extra)
}

export async function sendInvoiceEmail(
  to: string, data: InvoiceEmailData, extra: SendTemplatedEmailArgs = { to }
): Promise<SendTemplatedEmailResult> {
  return sendAndLog('invoice', to, invoiceEmail(data), extra)
}

export async function sendPaymentReminderEmail(
  to: string, data: PaymentReminderEmailData, extra: SendTemplatedEmailArgs = { to }
): Promise<SendTemplatedEmailResult> {
  return sendAndLog('payment_reminder', to, paymentReminderEmail(data), extra)
}

export async function sendFollowUpEmail(
  to: string, data: FollowUpEmailData, extra: SendTemplatedEmailArgs = { to }
): Promise<SendTemplatedEmailResult> {
  return sendAndLog('follow_up', to, followUpEmail(data), extra)
}

export async function sendBookingConfirmationEmail(
  to: string, data: BookingConfirmationEmailData, extra: SendTemplatedEmailArgs = { to }
): Promise<SendTemplatedEmailResult> {
  return sendAndLog('booking_confirmation', to, bookingConfirmationEmail(data), extra)
}
