import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { createServerAuthClient } from '@/lib/supabase-server';
import { parseExcelBuffer, ParsedLead } from '@/lib/excel-parser';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = cookies();
  const supabase = createServerAuthClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const formData = await req.formData();

  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json(
      { error: 'No file uploaded' },
      { status: 400 }
    );
  }

  const ext = file.name.split('.').pop()?.toLowerCase();

  if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return NextResponse.json(
      { error: 'Invalid file type' },
      { status: 400 }
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'File exceeds 5MB limit' },
      { status: 400 }
    );
  }

  const buffer = await file.arrayBuffer();

  let parsed;

  try {
    parsed = parseExcelBuffer(buffer);
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse file' },
      { status: 400 }
    );
  }

  const { valid, invalid, totalRows } = parsed;

  const { data: importRecord, error: importError } = await supabase
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

  if (importError || !importRecord) {
    return NextResponse.json(
      { error: 'Failed to create import record' },
      { status: 500 }
    );
  }

  let insertedCount = 0;
  let skippedCount = 0;

  const chunkSize = 100;

  for (let i = 0; i < valid.length; i += chunkSize) {
    const chunk: ParsedLead[] = valid.slice(i, i + chunkSize);

    const phones = chunk.map((l) => l.phone);

    const { data: existing } = await supabase
      .from('leads')
      .select('phone')
      .in('phone', phones);

    const existingPhones = new Set(
      (existing ?? []).map((r: { phone: string }) => r.phone)
    );

    const newLeads = chunk
      .filter((l) => !existingPhones.has(l.phone))
      .map((lead) => ({
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? null,
        source: lead.source ?? 'excel_import',
        notes: lead.notes ?? null,
        status: 'new',
      }));
        

    skippedCount += chunk.length - newLeads.length;

    if (newLeads.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from('leads')
        .insert(newLeads)
        .select('id');

      console.log('INSERT ERROR:', insertErr);

      if (!insertErr && Array.isArray(inserted)) {
        insertedCount += inserted.length;
      }
    }
  }

  await supabase
    .from('lead_imports')
    .update({
      valid_rows: insertedCount,
      status: 'completed',
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
    errors: invalid.slice(0, 20),
  });
}

export async function GET(): Promise<NextResponse> {
  const cookieStore = cookies();
  const supabase = createServerAuthClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from('lead_imports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    imports: data ?? [],
  });
}