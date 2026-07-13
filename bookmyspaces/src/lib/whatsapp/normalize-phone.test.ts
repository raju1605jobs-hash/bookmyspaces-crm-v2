import { describe, it, expect } from 'vitest'
import { normalizePhone } from './normalize-phone'

describe('normalizePhone', () => {
  it('prefixes a raw 10-digit Indian number with country code', () => {
    expect(normalizePhone('9051459463')).toBe('919051459463')
  })

  it('leaves an already-normalized 12-digit 91-prefixed number unchanged', () => {
    expect(normalizePhone('919051459463')).toBe('919051459463')
  })

  it('strips a leading + and non-digit characters', () => {
    expect(normalizePhone('+91 90514 59463')).toBe('919051459463')
  })

  it('strips punctuation from a raw number before prefixing', () => {
    expect(normalizePhone('90514-59463')).toBe('919051459463')
  })
})
