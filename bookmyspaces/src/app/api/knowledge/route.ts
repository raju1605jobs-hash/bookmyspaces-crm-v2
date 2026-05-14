export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase'
import { STATIC_KNOWLEDGE } from '@/lib/documents'
import { chunkText } from '@/lib/ai'
import OpenAI from 'openai'

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return new OpenAI({ apiKey: key })
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  })
  return response.data[0].embedding
}

async function seedOneSource(
  source: string,
  text: string,
  sourceType: 'manual',
  category: string
): Promise<{ source: string; chunks: number; error?: string }> {
  const supabaseAdmin = getSupabaseAdmin()

  // Delete existing
  await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', source)

  const chunks = chunkText(text, 800, 100)
  let processedCount = 0

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await generateEmbedding(chunks[i])
      const { error } = await supabaseAdmin.from('knowledge_chunks').insert({
        source_file: source,
        source_type: sourceType,
        category,
        content: chunks[i],
        chunk_index: i,
        embedding,
        metadata: { total_chunks: chunks.length },
      })
      if (error) {
        logger.error('knowledge', `Chunk insert error ${source}[${i}]`, error)
      } else {
        processedCount++
      }
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      logger.error('knowledge', `Embedding error ${source}[${i}]`, err)
    }
  }

  return { source, chunks: processedCount }
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const { data: docs, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
    const { count: chunkCount } = await supabaseAdmin
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
    if (docsError) throw docsError
    return NextResponse.json({ documents: docs, total_chunks: chunkCount })
  } catch (error) {
    logger.error('knowledge', 'GET error', error)
    return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, text, source, category, name } = body

    // ── SEED STATIC: process one source at a time to stay under timeout ──
    if (action === 'seed_static') {
      const results = []
      let totalChunks = 0

      for (const item of STATIC_KNOWLEDGE) {
        const result = await seedOneSource(item.source, item.text, 'manual', item.category)
        results.push(result)
        totalChunks += result.chunks
      }

      return NextResponse.json({
        success: true,
        message: `Seeded ${totalChunks} chunks from ${STATIC_KNOWLEDGE.length} sources`,
        results,
      })
    }

    // ── SEED SINGLE: seed one source by index (for chunked seeding) ──
    if (action === 'seed_one') {
      const index = parseInt(body.index ?? '0')
      const item = STATIC_KNOWLEDGE[index]
      if (!item) return NextResponse.json({ error: 'Invalid index' }, { status: 400 })

      const result = await seedOneSource(item.source, item.text, 'manual', item.category)
      return NextResponse.json({
        success: true,
        result,
        next: index + 1 < STATIC_KNOWLEDGE.length ? index + 1 : null,
        total: STATIC_KNOWLEDGE.length,
      })
    }

    // ── ADD CUSTOM TEXT ──
    if (action === 'add_text' && text && source) {
      const supabaseAdmin = getSupabaseAdmin()
      await supabaseAdmin.from('knowledge_chunks').delete().eq('source_file', source)
      const { data: doc } = await supabaseAdmin
        .from('documents')
        .upsert({
          name: name || source,
          original_filename: source,
          file_type: 'txt',
          category,
          processed: false,
          uploaded_by: 'admin',
        })
        .select('id')
        .single()

      const result = await seedOneSource(source, text, 'manual', category || 'general')
      if (doc) {
        await supabaseAdmin
          .from('documents')
          .update({ processed: true, chunk_count: result.chunks })
          .eq('id', doc.id)
      }
      return NextResponse.json({
        success: true,
        message: `Processed ${result.chunks} chunks from ${source}`,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    logger.error('knowledge', 'POST error', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to process knowledge',
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
    return NextResponse.json({ success: true, message: `Deleted knowledge for: ${source}` })
  } catch (error) {
    logger.error('knowledge', 'DELETE error', error)
    return NextResponse.json({ error: 'Failed to delete knowledge' }, { status: 500 })
  }
}
