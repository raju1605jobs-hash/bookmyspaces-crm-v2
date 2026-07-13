import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  isEmailProviderConfigured: vi.fn(),
}))

vi.mock('@/lib/email/provider', () => ({
  sendEmail: mocks.sendEmail,
  isEmailProviderConfigured: mocks.isEmailProviderConfigured,
}))

import { resendEmailProvider } from './email-provider'

describe('resendEmailProvider.send', () => {
  beforeEach(() => {
    mocks.sendEmail.mockReset()
    mocks.isEmailProviderConfigured.mockReset()
  })

  it('short-circuits without calling sendEmail when the provider is not configured', async () => {
    mocks.isEmailProviderConfigured.mockReturnValue(false)

    const result = await resendEmailProvider.send({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' })

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.retryable).toBe(false)
  })

  it('delegates to sendEmail with the same fields when configured', async () => {
    mocks.isEmailProviderConfigured.mockReturnValue(true)
    mocks.sendEmail.mockResolvedValue({ success: true, providerMessageId: 'msg_123' })

    const result = await resendEmailProvider.send({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' })

    expect(mocks.sendEmail).toHaveBeenCalledWith({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', attachments: undefined })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.providerMessageId).toBe('msg_123')
  })

  it('surfaces a retryable error when the underlying send fails', async () => {
    mocks.isEmailProviderConfigured.mockReturnValue(true)
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'Resend API returned 500' })

    const result = await resendEmailProvider.send({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.retryable).toBe(true)
      expect(result.error.message).toBe('Resend API returned 500')
    }
  })
})
