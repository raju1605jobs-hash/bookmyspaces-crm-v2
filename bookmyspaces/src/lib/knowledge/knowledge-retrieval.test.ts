import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/ai', () => ({
  generateEmbedding: mocks.generateEmbedding,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}))

import { retrieveKnowledgeByVector, formatKnowledgeResults } from './knowledge-retrieval'

describe('retrieveKnowledgeByVector', () => {
  beforeEach(() => {
    mocks.generateEmbedding.mockReset()
    mocks.rpc.mockReset()
  })

  it('returns [] without calling anything for an empty/whitespace query', async () => {
    const result = await retrieveKnowledgeByVector('   ')
    expect(result).toEqual([])
    expect(mocks.generateEmbedding).not.toHaveBeenCalled()
  })

  it('embeds the query and calls match_knowledge_chunks with the right defaults', async () => {
    mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    mocks.rpc.mockResolvedValue({
      data: [
        { id: 'k1', content: 'Skyline Serenity has 12 rooms', source_file: 'property_faq.md', category: 'property', similarity: 0.82 },
      ],
      error: null,
    })

    const result = await retrieveKnowledgeByVector('how many rooms does skyline serenity have')

    expect(mocks.generateEmbedding).toHaveBeenCalledWith('how many rooms does skyline serenity have')
    expect(mocks.rpc).toHaveBeenCalledWith('match_knowledge_chunks', {
      query_embedding: [0.1, 0.2, 0.3],
      match_threshold: 0.65,
      match_count: 4,
    })
    expect(result).toEqual([
      { id: 'k1', content: 'Skyline Serenity has 12 rooms', sourceFile: 'property_faq.md', category: 'property', similarity: 0.82 },
    ])
  })

  it('respects custom matchThreshold/matchCount', async () => {
    mocks.generateEmbedding.mockResolvedValue([0.1])
    mocks.rpc.mockResolvedValue({ data: [], error: null })

    await retrieveKnowledgeByVector('rooftop pricing', { matchThreshold: 0.5, matchCount: 8 })

    expect(mocks.rpc).toHaveBeenCalledWith('match_knowledge_chunks', {
      query_embedding: [0.1],
      match_threshold: 0.5,
      match_count: 8,
    })
  })

  it('degrades to [] when the RPC errors', async () => {
    mocks.generateEmbedding.mockResolvedValue([0.1])
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const result = await retrieveKnowledgeByVector('anything')
    expect(result).toEqual([])
  })

  it('degrades to [] when embedding generation throws (e.g. missing OPENAI_API_KEY)', async () => {
    mocks.generateEmbedding.mockRejectedValue(new Error('OPENAI_API_KEY is not set'))

    const result = await retrieveKnowledgeByVector('anything')
    expect(result).toEqual([])
  })
})

describe('formatKnowledgeResults', () => {
  it('returns an empty string for no results', () => {
    expect(formatKnowledgeResults([])).toBe('')
  })

  it('formats results in the [CATEGORY — source] / content shape', () => {
    const formatted = formatKnowledgeResults([
      { id: 'k1', content: 'Content A', sourceFile: 'a.md', category: 'pricing', similarity: 0.9 },
      { id: 'k2', content: 'Content B', sourceFile: 'b.md', category: null, similarity: 0.7 },
    ])
    expect(formatted).toBe('[PRICING — a.md]\nContent A\n\n---\n\n[INFO — b.md]\nContent B')
  })
})
