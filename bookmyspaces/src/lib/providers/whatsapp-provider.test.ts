import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendWhatsAppMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
  verifySignature: vi.fn(),
}))

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
  sendTemplateMessage: mocks.sendTemplateMessage,
}))

vi.mock('@/lib/whatsapp/verify-signature', () => ({
  verifySignature: mocks.verifySignature,
}))

import { whatsAppProvider } from './whatsapp-provider'

describe('whatsAppProvider.send', () => {
  beforeEach(() => {
    mocks.sendWhatsAppMessage.mockReset()
    mocks.sendTemplateMessage.mockReset()
  })

  it('delegates plain text sends to sendWhatsAppMessage with the exact same args', async () => {
    mocks.sendWhatsAppMessage.mockResolvedValue(true)

    const result = await whatsAppProvider.send({ channel: 'whatsapp', recipientId: '+919876543210', text: 'Hello' })

    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith('+919876543210', 'Hello')
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('delegates template sends to sendTemplateMessage with converted params', async () => {
    mocks.sendTemplateMessage.mockResolvedValue(true)

    await whatsAppProvider.send({
      channel: 'whatsapp',
      recipientId: '+919876543210',
      templateName: 'booking_confirmed',
      templateParams: { guest_name: 'Priya', date: '2026-08-01' },
    })

    expect(mocks.sendTemplateMessage).toHaveBeenCalledWith(
      '+919876543210',
      'booking_confirmed',
      [{ name: 'guest_name', value: 'Priya' }, { name: 'date', value: '2026-08-01' }]
    )
  })

  it('returns a retryable error when the underlying send returns false', async () => {
    mocks.sendWhatsAppMessage.mockResolvedValue(false)

    const result = await whatsAppProvider.send({ channel: 'whatsapp', recipientId: '+919876543210', text: 'Hi' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.retryable).toBe(true)
  })

  it('rejects a message addressed to a different channel', async () => {
    const result = await whatsAppProvider.send({ channel: 'facebook', recipientId: 'psid123', text: 'Hi' })
    expect(result.ok).toBe(false)
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled()
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
