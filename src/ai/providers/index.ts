/**
 * Unified provider router — Step 1 scaffold.
 * Step 5 will wire real SDKs (ollama, openai, anthropic, google). For now: mock streaming.
 */
import type { AIProviderId, ChatRequest } from '@shared/types/ai'
import type { AIProvider } from '../types/provider'

class MockProvider implements AIProvider {
  constructor(public id: AIProviderId) {}

  async chat(request: ChatRequest): Promise<string> {
    const last = request.messages[request.messages.length - 1]?.content ?? ''
    const ctx = request.context ? `\n\n[Context: ${request.context.title} — ${request.context.url.slice(0, 80)}]` : ''
    return `[${this.id} mock] Echo: ${last}${ctx}`
  }

  async chatStream(request: ChatRequest, onChunk: (delta: string) => void): Promise<void> {
    const full = await this.chat(request)
    const parts = full.split(/(\s+)/)
    for (const p of parts) {
      onChunk(p)
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}

export function getProvider(id: AIProviderId): AIProvider {
  // Step 5: switch to real implementations (ollama.ts, openai.ts, etc.)
  return new MockProvider(id)
}

export async function chatWithProvider(request: ChatRequest): Promise<string> {
  const provider = getProvider(request.providerId)
  return provider.chat(request)
}

export async function chatStreamWithProvider(
  request: ChatRequest,
  onChunk: (delta: string) => void
): Promise<void> {
  const provider = getProvider(request.providerId)
  await provider.chatStream(request, onChunk)
}
