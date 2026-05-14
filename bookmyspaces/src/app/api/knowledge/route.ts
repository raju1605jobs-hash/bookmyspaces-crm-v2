export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { STATIC_KNOWLEDGE } from '@/lib/documents'
import { chunkText } from '@/lib/ai'

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { data: docs, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
    const { count: chunkCount } = await supabaseAdmin
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
    if (error) throw error
    return NextResponse.json({ documents: docs, total_chunks: chunkCount })
  } catch (error) {
    logger.error('knowledge', 'GET error', error)
    return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const body = await req.json()
    const { action, text, source, category, name, index } = body

    // Seed one source at a time (no embeddings - text search only)
    if (action === 'seed_one') {
      const idx = parseInt(index ?? '0')
      const item = STATIC_KNOWLEDGE[idx]
      if (!item) return NextResponse.json({ error: 'Invalid index' }, { status: 400 })

      // Delete existing chunks for this source
      await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', item.source)

      const chunks = chunkText(item.text, 800, 100)
      let inserted = 0

      for (let i = 0; i < chunks.length; i++) {
        const { error } = await supabaseAdmin.from('knowledge_chunks').insert({
          source_file: item.source,
          source_type: 'manual',
          category: item.category,
          content: chunks[i],
          chunk_index: i,
          embedding: null,
          metadata: { total_chunks: chunks.length },
        })
        if (!error) inserted++
      }

      return NextResponse.json({
        success: true,
        result: { source: item.source, chunks: inserted },
        next: idx + 1 < STATIC_KNOWLEDGE.length ? idx + 1 : null,
        total: STATIC_KNOWLEDGE.length,
      })
    }

    // Add custom text
    if (action === 'add_text' && text && source) {
      await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', source)

      const chunks = chunkText(text, 800, 100)
      let inserted = 0

      for (let i = 0; i < chunks.length; i++) {
        const { error } = await supabaseAdmin.from('knowledge_chunks').insert({
          source_file: source,
          source_type: 'txt',
          category: category || 'general',
          content: chunks[i],
          chunk_index: i,
          embedding: null,
          metadata: { total_chunks: chunks.length },
        })
        if (!error) inserted++
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${inserted} chunks from ${source}`,
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

