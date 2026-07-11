export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { STATIC_KNOWLEDGE } from '@/lib/documents'
import { chunkText } from '@/lib/ai'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { data: docs, error } = await supabaseAdmin
      .from('documents').select('*').order('created_at', { ascending: false })
    const { count: chunkCount } = await supabaseAdmin
      .from('knowledge_chunks').select('*', { count: 'exact', head: true })
    if (error) throw error
    return NextResponse.json({ documents: docs, total_chunks: chunkCount })
  } catch (error) {
    logger.error('knowledge', 'GET error', error)
    return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { action, text, source, category, index } = body

    // ── SEED ALL: delete everything and insert all sources in one batch ──
    if (action === 'seed_all') {
      // Delete all existing static knowledge chunks in one go
      const sources = STATIC_KNOWLEDGE.map(k => k.source)
      await supabaseAdmin.from('knowledge_chunks').delete().in('source_file', sources)

      // Build all rows across all sources
      const allRows: any[] = []
      for (const item of STATIC_KNOWLEDGE) {
        const chunks = chunkText(item.text, 800, 100)
        for (let i = 0; i < chunks.length; i++) {
          allRows.push({
            source_file: item.source,
            source_type: 'manual',
            category: item.category,
            content: chunks[i],
            chunk_index: i,
            embedding: null,
            metadata: { total_chunks: chunks.length },
          })
        }
      }

      // Single batch insert
      const { error } = await supabaseAdmin.from('knowledge_chunks').insert(allRows)
      if (error) {
        logger.error('knowledge', 'Seed all failed', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `Seeded ${allRows.length} chunks from ${STATIC_KNOWLEDGE.length} sources`,
        total_chunks: allRows.length,
        sources: STATIC_KNOWLEDGE.length,
      })
    }

    // ── SEED ONE (kept for compatibility) ──
    if (action === 'seed_one') {
      const idx = Number(index ?? 0)
      const item = STATIC_KNOWLEDGE[idx]
      if (!item) return NextResponse.json({ error: 'Invalid index' }, { status: 400 })

      await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', item.source)

      const chunks = chunkText(item.text, 800, 100)
      const rows = chunks.map((content, i) => ({
        source_file: item.source,
        source_type: 'manual',
        category: item.category,
        content,
        chunk_index: i,
        embedding: null,
        metadata: { total_chunks: chunks.length },
      }))

      const { error } = await supabaseAdmin.from('knowledge_chunks').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({
        success: true,
        result: { source: item.source, chunks: rows.length },
        next: idx + 1 < STATIC_KNOWLEDGE.length ? idx + 1 : null,
        total: STATIC_KNOWLEDGE.length,
      })
    }

    // ── ADD CUSTOM TEXT ──
    if (action === 'add_text' && text && source) {
      await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', source)

      const chunks = chunkText(text, 800, 100)
      const rows = chunks.map((content, i) => ({
        source_file: source,
        source_type: 'txt',
        category: category || 'general',
        content,
        chunk_index: i,
        embedding: null,
        metadata: { total_chunks: chunks.length },
      }))

      const { error } = await supabaseAdmin.from('knowledge_chunks').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({
        success: true,
        message: `Processed ${rows.length} chunks from ${source}`,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    logger.error('knowledge', 'POST error', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed',
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  try {
    const { searchParams } = new URL(req.url)
    const source = searchParams.get('source')
    if (!source) return NextResponse.json({ error: 'Source required' }, { status: 400 })
    const supabaseAdmin = getSupabaseAdmin()
    await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', source)
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('knowledge', 'DELETE error', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
