// lib/excel-parser.ts
// Parses Excel (.xlsx) and CSV files for lead import
// Uses xlsx library (add: npm install xlsx)

import * as XLSX from 'xlsx';

export interface RawLeadRow {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  source?: string;
  notes?: string;
  [key: string]: string | undefined;
}

export interface ParsedLead {
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  source: string;
  notes: string | null;
}

export interface ParseResult {
  valid: ParsedLead[];
  invalid: { row: number; data: RawLeadRow; errors: string[] }[];
  totalRows: number;
}

// Normalize phone: strip spaces, dashes, ensure +91 for Indian numbers
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && raw.startsWith('+')) return raw.replace(/\s/g, '');
  return raw.trim();
}

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ''));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Map flexible column headers to standard fields
function mapHeaders(rawRow: Record<string, unknown>): RawLeadRow {
  const mapped: RawLeadRow = {};
  const headerMap: Record<string, keyof RawLeadRow> = {
    'name': 'name', 'full name': 'name', 'contact name': 'name', 'client name': 'name',
    'phone': 'phone', 'mobile': 'phone', 'whatsapp': 'phone', 'contact': 'phone', 'number': 'phone',
    'email': 'email', 'email address': 'email', 'mail': 'email',
    'company': 'company', 'organization': 'company', 'org': 'company', 'business': 'company',
    'source': 'source', 'lead source': 'source', 'channel': 'source',
    'notes': 'notes', 'note': 'notes', 'remarks': 'notes', 'comments': 'notes',
  };

  for (const [key, value] of Object.entries(rawRow)) {
    const normalKey = key.toLowerCase().trim();
    const mappedKey = headerMap[normalKey];
    if (mappedKey) {
      mapped[mappedKey] = value != null ? String(value).trim() : undefined;
    }
  }
  return mapped;
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const valid: ParsedLead[] = [];
  const invalid: ParseResult['invalid'] = [];

  rows.forEach((rawRow, idx) => {
    const row = mapHeaders(rawRow);
    const errors: string[] = [];
    const rowNum = idx + 2; // 1-indexed + header row

    // Required: name
    if (!row.name) errors.push('Name is required');

    // Required: phone
    if (!row.phone) {
      errors.push('Phone is required');
    } else {
      const normalized = normalizePhone(row.phone);
      if (!isValidPhone(normalized)) {
        errors.push(`Invalid phone: ${row.phone}`);
      } else {
        row.phone = normalized;
      }
    }

    // Optional: email validation
    if (row.email && !isValidEmail(row.email)) {
      errors.push(`Invalid email: ${row.email}`);
    }

    if (errors.length > 0) {
      invalid.push({ row: rowNum, data: row, errors });
    } else {
      valid.push({
        name: row.name!,
        phone: row.phone!,
        email: row.email || null,
        company: row.company || null,
        source: row.source || 'excel_import',
        notes: row.notes || null,
      });
    }
  });

  return {
    valid,
    invalid,
    totalRows: rows.length,
  };
}
