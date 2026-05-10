export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { supabaseAdmin } from '@/lib/supabase'
import { processTextIntoKnowledgeBase, deleteKnowledgeBySource, STATIC_KNOWLEDGE } from '@/lib/documents'

export const runtime = 'nodejs'
export const maxDuration = 120 // 2 minutes for processing

// GET — list all knowledge chunks / documents
export async function GET() {
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
    logger.error('knowledge', 'GET /api/knowledge error', error)
    return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 })
  }
}

// POST — seed static knowledge or process uploaded text
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, text, source, category, name } = body

    // Action: seed_static — loads all built-in business knowledge
    if (action === 'seed_static') {
      let totalChunks = 0
      const results = []

      for (const item of STATIC_KNOWLEDGE) {
        // Delete old chunks for this source
        await deleteKnowledgeBySource(item.source)

        // Process and embed
        const count = await processTextIntoKnowledgeBase(
          item.text,
          item.source,
          'manual',
          item.category
        )

        totalChunks += count
        results.push({ source: item.source, chunks: count })
      }

      return NextResponse.json({
        success: true,
        message: `Seeded ${totalChunks} knowledge chunks from ${STATIC_KNOWLEDGE.length} sources`,
        results,
      })
    }

    // Action: add_text — add custom text to knowledge base
    if (action === 'add_text' && text && source) {
      // Delete old chunks for this source
      await deleteKnowledgeBySource(source)

      // Register document
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

      const count = await processTextIntoKnowledgeBase(
        text,
        source,
        'txt',
        category || 'general'
      )

      // Update document record
      if (doc) {
        await supabaseAdmin
          .from('documents')
          .update({ processed: true, chunk_count: count })
          .eq('id', doc.id)
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${count} chunks from ${source}`,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    logger.error('knowledge', 'POST /api/knowledge error', error)
    return NextResponse.json({ error: 'Failed to process knowledge' }, { status: 500 })
  }
}

// DELETE — remove knowledge by source
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const source = searchParams.get('source')

    if (!source) {
      return NextResponse.json({ error: 'Source required' }, { status: 400 })
    }

    await deleteKnowledgeBySource(source)

    return NextResponse.json({ success: true, message: `Deleted knowledge for: ${source}` })
  } catch (error) {
    logger.error('knowledge', 'DELETE /api/knowledge error', error)
    return NextResponse.json({ error: 'Failed to delete knowledge' }, { status: 500 })
  }
}
