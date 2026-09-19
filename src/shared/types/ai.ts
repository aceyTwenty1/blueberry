/** AI Provider & Chat types - shared */

export type AIProviderId = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'local-smollm135' | 'huggingface'

export interface AIProviderConfig {
  id: AIProviderId
  label: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  model: string
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  context?: PageContext
}

export interface PageContext {
  url: string
  title: string
  markdown: string
  excerpt?: string
  metadata?: Record<string, string>
}

export interface ChatRequest {
  messages: AIMessage[]
  providerId: AIProviderId
  stream?: boolean
  context?: PageContext
  temperature?: number
  maxTokens?: number
}

export interface ChatChunk {
  id: string
  delta: string
  done: boolean
}

export interface AISystemPromptOptions {
  pageContext?: PageContext
  task?: 'summarize' | 'qa' | 'extract' | 'general'
}

export type AIActionId =
  | 'summarize-page'
  | 'extract-tables'
  | 'find-pricing'
  | 'clean-view'
  | 'explain-code'
  | 'draft-email'

export interface AIQuickAction {
  id: AIActionId
  label: string
  prompt: string
  icon: string
}
