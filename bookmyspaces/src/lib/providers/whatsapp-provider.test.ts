import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendWhatsAppText: vi.fn(),
  sendWhatsAppTemplateSimple: vi.fn(),
  verifySignature: vi.fn(),
}))

vi.mock('@/lib/whatsapp/send-message', () => ({
  sendWhatsAppText: mocks.sendWhatsAppText,
  sendWhatsAppTemplateSimple: mocks.sendWhatsAppTemplateSimple,
}))

vi.mock('@/lib/whatsapp/verify-signature', () => ({
  verifySignature: mocks.verifySignature,
}))

import { whatsAppProvider } from './whatsapp-provider'

describe('whatsAppProvider.send', () => {
  beforeEach(() => {
    mocks.sendWhatsAppText.mockReset()
    mocks.sendWhatsAppTemplateSimple.mockReset()
  })

  it('delegates plain text sends to sendWhatsAppText with the exact same args', async () => {
    mocks.sendWhatsAppText.mockResolvedValue({ success: true, waMessageId: 'wamid.1' })

    const result = await whatsAppProvider.send({ channel: 'whatsapp', recipientId: '+919876543210', text: 'Hello' })

    expect(mocks.sendWhatsAppText).toHaveBeenCalledWith('+919876543210', 'Hello')
    expect(mocks.sendWhatsAppTemplateSimple).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.providerMessageId).toBe('wamid.1')
  })

  it('delegates template sends to sendWhatsAppTemplateSimple with converted params', async () => {
    mocks.sendWhatsAppTemplateSimple.mockResolvedValue({ success: true, waMessageId: 'wamid.2' })

    await whatsAppProvider.send({
      channel: 'whatsapp',
      recipientId: '+919876543210',
      templateName: 'booking_confirmed',
      templateParams: { guest_name: 'Priya', date: '2026-08-01' },
    })

    expect(mocks.sendWhatsAppTemplateSimple).toHaveBeenCalledWith(
      '+919876543210',
      'booking_confirmed',
      [{ name: 'guest_name', value: 'Priya' }, { name: 'date', value: '2026-08-01' }]
    )
  })

  it('returns a retryable error when the underlying send fails', async () => {
    mocks.sendWhatsAppText.mockResolvedValue({ success: false, error: 'send_failed' })

    const result = await whatsAppProvider.send({ channel: 'whatsapp', recipientId: '+919876543210', text: 'Hi' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.retryable).toBe(true)
  })

  it('rejects a message addressed to a different channel', async () => {
    const result = await whatsAppProvider.send({ channel: 'facebook', recipientId: 'psid123', text: 'Hi' })
    expect(result.ok).toBe(false)
    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled()
  })
})

describe('whatsAppProvider.verifyWebhook', () => {
  it('returns true only when verifySignature reports valid', () => {
    mocks.verifySignature.mockReturnValue('valid')
    expect(whatsAppProvider.verifyWebhook({ 'x-hub-signature-256': 'sha256=abc' }, '{}')).toBe(true)
  })

  it('returns false for invalid or unconfigured', () => {
    mocks.verifySignature.mockReturnValue('invalid')
    expect(whatsAppProvider.verifyWebhook({}, '{}')).toBe(false)
    mocks.verifySignature.mockReturnValue('unconfigured')
    expect(whatsAppProvider.verifyWebhook({}, '{}')).toBe(false)
  })
})
