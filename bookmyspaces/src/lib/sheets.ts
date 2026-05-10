import { google, sheets_v4 } from 'googleapis'
import { Lead } from './supabase'
import { logger } from './logger'

// ═══════════════════════════════════════════════════════
// BOOKMYSPACES — GOOGLE SHEETS INTEGRATION
// Professional formatting, deduplication, status colours
// ═══════════════════════════════════════════════════════

// ── Column layout (must match buildRow order) ───────────
export const SHEET_HEADERS = [
  'Timestamp',      // A col 0
  'Lead Name',      // B col 1
  'Phone',          // C col 2  — plain text
  'Email',          // D col 3
  'Event Type',     // E col 4
  'Guest Count',    // F col 5
  'Budget',         // G col 6
  'Venue',          // H col 7
  'Interest',       // I col 8  — inquiry summary
  'Source',         // J col 9
  'Lead Stage',     // K col 10 — status, colour coded
  'AI Score',       // L col 11
  'Assigned To',    // M col 12
  'Last Follow-up', // N col 13
  'Notes',          // O col 14
  'Proposal Sent',  // P col 15
  'Lead ID',        // Q col 16 — UUID anchor for dedup
]
const NCOLS = SHEET_HEADERS.length        // 17
const LAST_COL = String.fromCharCode(65 + NCOLS - 1) // 'Q'
const PHONE_COL = 2
const LEAD_ID_COL = 16
const STAGE_COL = 10

// ── Status label + colour maps ──────────────────────────
const STATUS_LABEL: Record<string,string> = {
  new_inquiry:      'New Inquiry',
  followup_pending: 'Follow-up Pending',
  proposal_sent:    'Proposal Sent',
  negotiation:      'Negotiation',
  confirmed:        'Confirmed',
  rejected:         'Rejected',
  future_prospect:  'Future Prospect',
}

function stageRgb(status: string): {red:number;green:number;blue:number} {
  const m: Record<string,[number,number,number]> = {
    new_inquiry:      [0.88, 0.95, 1.00],
    followup_pending: [1.00, 0.97, 0.86],
    proposal_sent:    [0.93, 0.86, 1.00],
    negotiation:      [1.00, 0.91, 0.82],
    confirmed:        [0.86, 0.98, 0.87],
    rejected:         [1.00, 0.87, 0.87],
    future_prospect:  [0.94, 0.94, 0.94],
  }
  const [r,g,b] = m[status] ?? [1,1,1]
  return {red:r, green:g, blue:b}
}

// ── Private key normalizer ──────────────────────────────
function normalizePrivateKey(key: string): string {
  if (!key) return key
  let k = key.trim()
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'")))
    k = k.slice(1, -1)
  const NL = String.fromCharCode(10)
  k = k.split('\\n').join(NL)
  return k
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY ?? ''),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export function isSheetsConfigured(): boolean {
  return !!(process.env.GOOGLE_SHEETS_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY)
}

// ── Build row array — must match SHEET_HEADERS exactly ──
function buildRow(lead: Partial<Lead> & {id:string}): string[] {
  const status = lead.status ?? 'new_inquiry'
  return [
    lead.created_at
      ? new Date(lead.created_at).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})
      : new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'}), // A Timestamp
    lead.name || '',                                                     // B Lead Name
    lead.phone ? String(lead.phone) : '',                                // C Phone
    lead.email || '',                                                    // D Email
    lead.event_type || '',                                               // E Event Type
    lead.guest_count?.toString() || '',                                  // F Guest Count
    lead.budget || '',                                                   // G Budget
    lead.venue || '',                                                    // H Venue
    (lead as any).inquiry_summary || (lead as any).special_requirements || '', // I Interest
    lead.source || 'website',                                            // J Source
    STATUS_LABEL[status] ?? status,                                      // K Lead Stage
    ((lead as any).ai_score ?? (lead as any).lead_score ?? 5).toString(), // L AI Score
    (lead as any).assigned_to || '',                                     // M Assigned To
    (lead as any).last_contacted_at
      ? new Date((lead as any).last_contacted_at).toLocaleDateString('en-IN', {timeZone:'Asia/Kolkata'})
      : '',                                                              // N Last Follow-up
    (lead as any).notes || '',                                           // O Notes
    (lead as any).proposal_sent_at ? 'Yes' : 'No',                      // P Proposal Sent
    lead.id,                                                             // Q Lead ID
  ]
}

// ── Get numeric sheetId for batchUpdate ─────────────────
async function getSheetId(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({spreadsheetId})
  const s = meta.data.sheets?.find(s => s.properties?.title === 'Sheet1')
  return s?.properties?.sheetId ?? 0
}

// ── Find existing row by Lead ID or phone ───────────────
async function findRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  leadId: string,
  phone: string | null | undefined
): Promise<number | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `Sheet1!A2:${LAST_COL}`,
  })
  const rows = res.data.values ?? []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row[LEAD_ID_COL] === leadId) return i + 2
    if (phone && row[PHONE_COL]) {
      const a = row[PHONE_COL].replace(/\D/g, '')
      const b = phone.replace(/\D/g, '')
      if (a && b && a === b) return i + 2
    }
  }
  return null
}

// ── Apply formatting once (header + columns + filter) ───
async function applySheetFormatting(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  const colWidths = [120,140,115,185,120,80,100,110,210,90,135,65,110,110,210,100,260]
  const requests: sheets_v4.Schema$Request[] = [
    // Freeze row 1
    {updateSheetProperties:{
      properties:{sheetId, gridProperties:{frozenRowCount:1}},
      fields:'gridProperties.frozenRowCount',
    }},
    // Header row style: dark navy bg, white bold text, centred
    {repeatCell:{
      range:{sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex:NCOLS},
      cell:{userEnteredFormat:{
        backgroundColor:{red:0.067, green:0.098, blue:0.141},
        textFormat:{bold:true, foregroundColor:{red:1,green:1,blue:1}, fontSize:10},
        horizontalAlignment:'CENTER',
        verticalAlignment:'MIDDLE',
        wrapStrategy:'CLIP',
      }},
      fields:'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
    }},
    // Header row height
    {updateDimensionProperties:{
      range:{sheetId, dimension:'ROWS', startIndex:0, endIndex:1},
      properties:{pixelSize:36}, fields:'pixelSize',
    }},
    // Column widths
    ...colWidths.map((px, i) => ({
      updateDimensionProperties:{
        range:{sheetId, dimension:'COLUMNS', startIndex:i, endIndex:i+1},
        properties:{pixelSize:px}, fields:'pixelSize',
      },
    })),
    // Phone column — text number format
    {repeatCell:{
      range:{sheetId, startRowIndex:1, endRowIndex:10000, startColumnIndex:PHONE_COL, endColumnIndex:PHONE_COL+1},
      cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},
      fields:'userEnteredFormat.numberFormat',
    }},
    // Enable filter on header row
    {setBasicFilter:{filter:{range:{
      sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex:NCOLS,
    }}}},
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId, requestBody:{requests}})
}

// ── Format a single data row (alternating + stage colour) ─
async function formatRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  rowNum: number,   // 1-based sheet row
  status: string
): Promise<void> {
  const ri = rowNum - 1  // 0-based
  const even = ri % 2 === 0
  const bg = even
    ? {red:1, green:1, blue:1}
    : {red:0.973, green:0.973, blue:0.984}
  const requests: sheets_v4.Schema$Request[] = [
    // Row background
    {repeatCell:{
      range:{sheetId, startRowIndex:ri, endRowIndex:ri+1, startColumnIndex:0, endColumnIndex:NCOLS},
      cell:{userEnteredFormat:{backgroundColor:bg, textFormat:{fontSize:9}}},
      fields:'userEnteredFormat(backgroundColor,textFormat)',
    }},
    // Stage cell: status colour + bold centre
    {repeatCell:{
      range:{sheetId, startRowIndex:ri, endRowIndex:ri+1, startColumnIndex:STAGE_COL, endColumnIndex:STAGE_COL+1},
      cell:{userEnteredFormat:{
        backgroundColor:stageRgb(status),
        textFormat:{bold:true, fontSize:9},
        horizontalAlignment:'CENTER',
      }},
      fields:'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
    }},
    // AI Score: centred
    {repeatCell:{
      range:{sheetId, startRowIndex:ri, endRowIndex:ri+1, startColumnIndex:STAGE_COL+1, endColumnIndex:STAGE_COL+2},
      cell:{userEnteredFormat:{horizontalAlignment:'CENTER'}},
      fields:'userEnteredFormat.horizontalAlignment',
    }},
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId, requestBody:{requests}})
}

// ═══════════════════════════════════════════════════════
// PUBLIC: Initialize sheet — write headers + formatting
// ═══════════════════════════════════════════════════════
export async function initializeSheet(): Promise<void> {
  if (!isSheetsConfigured()) return
  try {
    const auth = getAuth()
    const sheets = google.sheets({version:'v4', auth})
    const sid = process.env.GOOGLE_SHEETS_ID!
    const sheetId = await getSheetId(sheets, sid)

    // Write headers if A1 is empty OR does not contain the expected header value
    const existing = await sheets.spreadsheets.values.get({spreadsheetId:sid, range:'Sheet1!A1'})
    const a1Value = existing.data.values?.[0]?.[0] ?? ''
    const headersCorrect = a1Value === 'Timestamp'

    if (!headersCorrect) {
      // Insert a blank row at top to push existing data down, then write headers in row 1
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
              inheritFromBefore: false,
            },
          }],
        },
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId:sid,
        range:`Sheet1!A1:${LAST_COL}1`,
        valueInputOption:'RAW',
        requestBody:{values:[SHEET_HEADERS]},
      })
      logger.info('sheets', 'Headers written to Sheet1 row 1 (existing data shifted down)')
    }

    await applySheetFormatting(sheets, sid, sheetId)
    logger.info('sheets', 'Professional formatting applied')
  } catch (e: unknown) {
    logger.error('sheets', 'initializeSheet failed', e)
  }
}

// ═══════════════════════════════════════════════════════
// PUBLIC: Sync lead — upsert with duplicate prevention
// ═══════════════════════════════════════════════════════
export async function syncLeadToSheets(
  leadOrPartial: Partial<Lead> & {id:string}
): Promise<boolean> {
  if (!isSheetsConfigured()) {
    logger.warn('sheets', 'Not configured — skipping sync')
    return false
  }

  try {
    // Fetch full lead if only {id} passed
    let lead = leadOrPartial
    const hasData = !!(
      leadOrPartial.name !== undefined ||
      leadOrPartial.phone !== undefined ||
      leadOrPartial.source !== undefined
    )
    if (!hasData) {
      const {supabaseAdmin} = await import('./supabase')
      const {data, error} = await supabaseAdmin
        .from('leads').select('*').eq('id', leadOrPartial.id).single()
      if (error || !data) {
        logger.error('sheets', 'Lead fetch failed', error, {leadId:leadOrPartial.id})
        return false
      }
      lead = data
    }

    const auth = getAuth()
    await auth.getClient()
    const sheets = google.sheets({version:'v4', auth})
    const sid = process.env.GOOGLE_SHEETS_ID!
    const sheetId = await getSheetId(sheets, sid)
    const row = buildRow(lead)
    const status = lead.status ?? 'new_inquiry'

    // Deduplication: update if row exists, append if new
    const existingRow = await findRow(sheets, sid, lead.id, lead.phone ?? null)

    if (existingRow !== null) {
      // UPDATE existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId:sid,
        range:`Sheet1!A${existingRow}:${LAST_COL}${existingRow}`,
        valueInputOption:'RAW',
        requestBody:{values:[row]},
      })
      await formatRow(sheets, sid, sheetId, existingRow, status)
      logger.info('sheets', `Row ${existingRow} updated`, {leadId:lead.id})
    } else {
      // APPEND new row
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId:sid,
        range:`Sheet1!A:${LAST_COL}`,
        valueInputOption:'RAW',
        insertDataOption:'INSERT_ROWS',
        requestBody:{values:[row]},
      })
      const range = result.data.updates?.updatedRange ?? ''
      const match = range.match(/(\d+)$/)
      const newRow = match ? parseInt(match[1]) : null
      if (newRow) await formatRow(sheets, sid, sheetId, newRow, status)
      logger.info('sheets', `Row ${newRow} appended`, {leadId:lead.id})
    }

    return true
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error)
    logger.error('sheets', `syncLeadToSheets failed: ${msg}`, error, {leadId:leadOrPartial.id})
    return false
  }
}

// ═══════════════════════════════════════════════════════
// PUBLIC: updateLeadInSheets — routes through sync
// ═══════════════════════════════════════════════════════
export async function updateLeadInSheets(lead: Lead): Promise<boolean> {
  return syncLeadToSheets(lead)
}
