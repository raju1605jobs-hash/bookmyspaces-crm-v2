// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/knowledge/knowledge-retrieval.ts
// V3 Day 4 — Priority 7 (Knowledge Base retrieval, production integration).
//
// The architecture review flagged this gap directly (audit/
// PHASE1_ARCHITECTURE_REVIEW_OMNICHANNEL.md) and Day 2's database review
// fixed half of it — `knowledge_chunks.embedding` already has an hnsw
// vector index, and a working `match_knowledge_chunks(query_embedding,
// match_threshold, match_count)` Postgres RPC function already exists (see
// supabase/migrations/005_stability_patch.sql, section 7). What was never
// built: an application-layer caller of that RPC. `chatWithAI()`
// (src/lib/ai.ts) has used a keyword/ILIKE fallback in
// `retrieveRelevantKnowledge()` the whole time — real vector search
// infrastructure has been sitting live and unused.
//
// This file is that missing caller. It reuses `generateEmbedding()` from
// src/lib/ai.ts (already live — same function `retrieveRelevantKnowledge`
// would need for real vector search) rather than reimplementing embedding
// generation, and calls the existing RPC rather than adding a new one.
//
// Deliberately does NOT modify src/lib/ai.ts's `retrieveRelevantKnowledge()`
// or `chatWithAI()` — those are live production code with no path to
// verify a behavior change in this sandbox (same reasoning Day 2 applied to
// SYSTEM_PROMPT). This is a new, additive function for the AI Context
// Builder (src/lib/ai/context-builder.ts) to call instead, which is not
// wired into any live route yet either.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/ai'

export interface KnowledgeResult {
  id: string
  content: string
  sourceFile: string
  category: string | null
  similarity: number
}

export interface RetrieveKnowledgeOptions {
  matchThreshold?: number
  matchCount?: number
}

/**
 * Real vector similarity search against `knowledge_chunks`, via the
 * existing `match_knowledge_chunks` RPC (cosine similarity, pgvector).
 * Falls back to an empty array (not an exception) on any failure —
 * embedding generation requires OPENAI_API_KEY, and the RPC requires a
 * live Supabase connection, neither confirmed available in every
 * environment this runs in. Callers (the AI Context Builder) treat an
 * empty result as "no knowledge base context available," the same
 * degrade-gracefully contract `retrieveRelevantKnowledge()` already has.
 */
export async function retrieveKnowledgeByVector(
  query: string,
  options: RetrieveKnowledgeOptions = {}
): Promise<KnowledgeResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  try {
    const embedding = await generateEmbedding(trimmed)
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      match_threshold: options.matchThreshold ?? 0.65,
      match_count: options.matchCount ?? 4,
    })

    if (error || !data) return []

    return (data as Array<{
      id: string
      content: string
      source_file: string
      category: string | null
      similarity: number
    }>).map((row) => ({
      id: row.id,
      content: row.content,
      sourceFile: row.source_file,
      category: row.category,
      similarity: row.similarity,
    }))
  } catch {
    // generateEmbedding() throws synchronously-wrapped if OPENAI_API_KEY
    // isn't set (getOpenAI()'s lazy-init check) — degrade gracefully rather
    // than let a missing key take down whatever called this.
    return []
  }
}

/**
 * Formats vector search results the same shape `retrieveRelevantKnowledge()`
 * already produces (`[CATEGORY — source]\ncontent`, joined by `---`), so the
 * AI Context Builder can drop this in as a like-for-like upgrade without a
 * prompt-format change.
 */
export function formatKnowledgeResults(results: KnowledgeResult[]): string {
  if (!results.length) return ''
  return results
    .map((r) => `[${(r.category || 'INFO').toUpperCase()} — ${r.sourceFile}]\n${r.content}`)
    .join('\n\n---\n\n')
}
