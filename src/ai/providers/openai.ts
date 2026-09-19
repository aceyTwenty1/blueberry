import type { ChatRequest } from '@shared/types/ai'
import type { AIProvider } from '../types/provider'

export class OpenAIProvider implements AIProvider {
  id = 'openai' as const
  constructor(private apiKey: string, private model = 'gpt-4o-mini') {}
  async chat(request: ChatRequest): Promise<string> {
    void this.apiKey
    return `[openai ${this.model}] mock — wire in Step 5. Prompt: ${request.messages.at(-1)?.content?.slice(0, 80)}`
  }
  async chatStream(request: ChatRequest, onChunk: (delta: string) => void): Promise<void> {
    const full = await this.chat(request)
    for (const w of full.split(' ')) { onChunk(w + ' '); await new Promise((r) => setTimeout(r, 10)) }
  }
}
