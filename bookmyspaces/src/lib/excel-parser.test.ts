// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/excel-parser.test.ts
// Sprint 5 — regression test for a real identity-resolution bug found this
// sprint: excel-parser.ts used to normalize phone numbers to a "+91XXXXXXXXXX"
// format that never matched a lead created via the WhatsApp webhook (which
// stores the bare digits-only "91XXXXXXXXXX" straight from message.from,
// no "+"). A customer imported via Excel who later messaged on WhatsApp
// would silently get a duplicate lead record instead of being recognized
// as the same person. Fixed by reusing the same canonical normalizer
// every other channel now converges on. See audit/SPRINT5_GO_LIVE_REPORT.md.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcelBuffer } from './excel-parser'

function bufferFromRows(rows: Record<string, string>[]): ArrayBuffer {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Leads')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseExcelBuffer — phone normalization', () => {
  it('normalizes a bare 10-digit phone to the canonical digits-only format (no +)', () => {
    const result = parseExcelBuffer(bufferFromRows([{ name: 'Priya Sharma', phone: '9051459463' }]))
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].phone).toBe('919051459463')
  })

  it('normalizes a "+91 xxxxx xxxxx" formatted phone to the same canonical format — no leading +', () => {
    const result = parseExcelBuffer(bufferFromRows([{ name: 'Rahul Verma', phone: '+91 90514 59463' }]))
    expect(result.valid).toHaveLength(1)
    // This is the crux of the bug: previously this would have stayed
    // "+919051459463" (with a +), which never matches the WhatsApp-native
    // "919051459463" (no +) stored for the same person.
    expect(result.valid[0].phone).toBe('919051459463')
    expect(result.valid[0].phone.startsWith('+')).toBe(false)
  })

  it('normalizes an already bare 12-digit phone (91 + 10 digits) idempotently', () => {
    const result = parseExcelBuffer(bufferFromRows([{ name: 'Aditi Rao', phone: '919051459463' }]))
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].phone).toBe('919051459463')
  })

  it('rejects a too-short phone number as invalid', () => {
    const result = parseExcelBuffer(bufferFromRows([{ name: 'Bad Row', phone: '12345' }]))
    expect(result.valid).toHaveLength(0)
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0].errors[0]).toMatch(/Invalid phone/)
  })

  it('rejects a row missing a phone number', () => {
    const result = parseExcelBuffer(bufferFromRows([{ name: 'No Phone' }]))
    expect(result.valid).toHaveLength(0)
    expect(result.invalid[0].errors).toContain('Phone is required')
  })
})
