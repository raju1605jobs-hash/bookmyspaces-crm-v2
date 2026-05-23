// app/api/leads/import/route.ts
// Handles Excel/CSV upload, validates, inserts leads, tracks import

import { NextRequest, NextResponse } from 'next/server';
import { createServerAuthClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import { parseExcelBuffer, ParsedLead } from '@/lib/excel-parser';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = createServerAuthClient();

  // Auth check
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  const fileExt = file.name.split('.').pop()?.toLowerCase();
  if (!validTypes.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(fileExt || '')) {
    return NextResponse.json({ error: 'Only Excel (.xlsx, .xls) and CSV files are supported' }, { status: 400 });
  }

  // File size limit: 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 5MB allowed.' }, { status: 400 });
  }

  // Parse file
  const buffer = await file.arrayBuffer();
  let parseResult;
  try {
    parseResult = parseExcelBuffer(buffer);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to parse file. Ensure it is a valid Excel or CSV file.' }, { status: 422 });
  }

  const { valid, invalid, totalRows } = parseResult;

  // Create import record
  const { data: importRecord, error: importErr } = await supabase
    .from('lead_imports')
    .insert({
      filename: file.name,
      total_rows: totalRows,
      valid_rows: valid.length,
      invalid_rows: invalid.length,
      status: 'processing',
      error_log: invalid,
      imported_by: session.user.id,
    })
    .select('id')
    .single();

  if (importErr || !importRecord) {
    return NextResponse.json({ error: 'Failed to create import record' }, { status: 500 });
  }

  // Insert valid leads (deduplicate by phone using upsert)
  let insertedCount = 0;
  let skippedCount = 0;

  if (valid.length > 0) {
    // Batch insert in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < valid.length; i += chunkSize) {
      const chunk = valid.slice(i, i + chunkSize);
      const leadsToInsert = chunk.map((lead: ParsedLead) => ({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        source: lead.source,
        notes: lead.notes,
        status: 'new',
        import_id: importRecord.id,
      }));

      // Upsert: skip duplicates by phone
      const { data: inserted, error: insertErr } = await supabase
        .from('leads')
        .upsert(leadsToInsert, {
          onConflict: 'phone',
          ignoreDuplicates: true,
        })
        .select('id');

      if (!insertErr && inserted) {
        insertedCount += inserted.length;
        skippedCount += chunk.length - inserted.length;
      }
    }
  }

  // Update import record status
  await supabase
    .from('lead_imports')
    .update({
      status: 'completed',
      valid_rows: insertedCount,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importRecord.id);

  return NextResponse.json({
    success: true,
    importId: importRecord.id,
    summary: {
      totalRows,
      inserted: insertedCount,
      skipped: skippedCount,
      invalid: invalid.length,
    },
    errors: invalid.slice(0, 20), // Return first 20 errors only
  });
}

// GET: fetch import history
export async function GET() {
  const supabase = createServerAuthClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('lead_imports')
    .select('id, filename, total_rows, valid_rows, invalid_rows, status, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imports: data });
}
