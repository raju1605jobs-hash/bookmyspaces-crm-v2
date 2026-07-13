// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/providers/ai-provider.ts
// V3 Day 2 — Provider Framework integration
//
// Implements AIProvider (src/lib/providers/types.ts) by delegating to the
// existing, live src/lib/ai.ts's chatWithAI(). Pure adapter — the Claude/
// OpenAI-fallback call chain, knowledge retrieval, and SYSTEM_PROMPT all stay
// in that file, unchanged.
//
// Known limitation, surfaced honestly rather than papered over: chatWithAI()
// does not accept a caller-supplied system prompt or arbitrary context — it
// always uses its own internal SYSTEM_PROMPT plus keyword-matched knowledge
// retrieval (see architecture review Section 1's "AI knowledge base" finding).
// AICompletionRequest.context and any 'system'-role messages passed to this
// adapter are therefore NOT forwarded to chatWithAI() today; they are
// accepted by the interface (so future orchestration code can be written
// against the full contract now) but ignored here until src/lib/ai.ts itself
// is extended to accept them — a Phase 3 change per the architecture review,
// not something to bolt on silently in an adapter.
// ─────────────────────────────────────────────────────────────────────────────

import { chatWithAI, type Message } from '@/lib/ai'
import type { AICompletionRequest, AICompletionResult, AIProvider, ProviderResponse } from './types'

export const claudeAIProvider: AIProvider = {
  name: 'claude-with-openai-fallback',

  async complete(request: AICompletionRequest): Promise<ProviderResponse<AICompletionResult>> {
    const conversational = request.messages.filter(
      (m): m is Message & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant'
    )

    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMessage) {
      return {
        ok: false,
        error: { code: 'no_user_message', message: 'AICompletionRequest must include at least one user message', retryable: false },
      }
    }

    try {
      const text = await chatWithAI(conversational, lastUserMessage.content)
      return {
        ok: true,
        data: { text, model: 'claude-haiku-4-5-20251001' },
      }
    } catch (err) {
      // chatWithAI() already has its own internal Claude->OpenAI fallback and
      // returns a fallback string on total failure rather than throwing — an
      // exception reaching here would be unexpected, so it's still handled,
      // but this path is not the primary error case.
      return {
        ok: false,
        error: { code: 'ai_provider_error', message: err instanceof Error ? err.message : String(err), cause: err, retryable: true },
      }
    }
  },
}
