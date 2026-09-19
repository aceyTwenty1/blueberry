import type { AIProviderId, ChatRequest } from '@shared/types/ai'

export interface AIProvider {
  id: AIProviderId
  chat(request: ChatRequest): Promise<string>
  chatStream(request: ChatRequest, onChunk: (delta: string) => void): Promise<void>
}

export interface OllamaOptions {
  baseUrl: string
  model: string
}

export interface OpenAIOptions {
  apiKey: string
  model: string
  baseUrl?: string
}

export interface AnthropicOptions {
  apiKey: string
  model: string
}

export interface GeminiOptions {
  apiKey: string
  model: string
}
