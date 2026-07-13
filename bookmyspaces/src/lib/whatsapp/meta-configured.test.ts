import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isMetaConfigured } from './meta-configured'

describe('isMetaConfigured', () => {
  const original = {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    numberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  }

  beforeEach(() => {
    delete process.env.WHATSAPP_ACCESS_TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
  })

  afterEach(() => {
    if (original.token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN
    else process.env.WHATSAPP_ACCESS_TOKEN = original.token
    if (original.numberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID
    else process.env.WHATSAPP_PHONE_NUMBER_ID = original.numberId
  })

  it('returns false when both env vars are missing', () => {
    expect(isMetaConfigured()).toBe(false)
  })

  it('returns false when only the token is set', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token123'
    expect(isMetaConfigured()).toBe(false)
  })

  it('returns false when only the phone number id is set', () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
    expect(isMetaConfigured()).toBe(false)
  })

  it('returns true when both are set', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token123'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
    expect(isMetaConfigured()).toBe(true)
  })
})
