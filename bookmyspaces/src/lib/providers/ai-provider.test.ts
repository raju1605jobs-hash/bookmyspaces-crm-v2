import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  chatWithAI: vi.fn(),
}))

vi.mock('@/lib/ai', () => ({
  chatWithAI: mocks.chatWithAI,
}))

import { claudeAIProvider } from './ai-provider'

describe('claudeAIProvider.complete', () => {
  beforeEach(() => {
    mocks.chatWithAI.mockReset()
  })

  it('passes the conversational messages and last user message to chatWithAI', async () => {
    mocks.chatWithAI.mockResolvedValue('Here is your answer')

    const result = await claudeAIProvider.complete({
      messages: [
        { role: 'user', content: 'What rooms do you have?' },
        { role: 'assistant', content: 'We have several options.' },
        { role: 'user', content: 'Tell me about pricing' },
      ],
    })

    expect(mocks.chatWithAI).toHaveBeenCalledWith(
      [
        { role: 'user', content: 'What rooms do you have?' },
        { role: 'assistant', content: 'We have several options.' },
        { role: 'user', content: 'Tell me about pricing' },
      ],
      'Tell me about pricing'
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.text).toBe('Here is your answer')
  })

  it('filters out system-role messages before calling chatWithAI (documented limitation)', async () => {
    mocks.chatWithAI.mockResolvedValue('ok')

    await claudeAIProvider.complete({
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hi' },
      ],
    })

    const [passedMessages] = mocks.chatWithAI.mock.calls[0]
    expect(passedMessages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('returns a non-retryable error when there is no user message at all', async () => {
    const result = await claudeAIProvider.complete({ messages: [{ role: 'assistant', content: 'Hello' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.retryable).toBe(false)
    expect(mocks.chatWithAI).not.toHaveBeenCalled()
  })
})
