/**
 * Ollama provider — local inference via http://localhost:11434
 * Full implementation lands in Step 5; this file reserves the module path.
 */
import type { ChatRequest } from '@shared/types/ai'
import type { AIProvider } from '../types/provider'

export class OllamaProvider implements AIProvider {
  id = 'ollama' as const
  constructor(
    private baseUrl = 'http://localhost:11434',
    private model = 'llama3.1'
  ) {}

  async chat(request: ChatRequest): Promise<string> {
    // TODO Step 5: use fetch to POST /api/chat with streaming
    return `[ollama ${this.model} @ ${this.baseUrl}] mock — wire in Step 5. Prompt: ${request.messages.at(-1)?.content?.slice(0, 80)}`
  }

  async chatStream(request: ChatRequest, onChunk: (delta: string) => void): Promise<void> {
    const full = await this.chat(request)
    for (const w of full.split(' ')) {
      onChunk(w + ' ')
      await new Promise((r) => setTimeout(r, 12))
    }
  }
}
