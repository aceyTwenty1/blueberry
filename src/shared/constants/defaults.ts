import type { AIProviderConfig } from '../types/ai'

export const DEFAULT_URL = 'https://www.google.com'
export const NEW_TAB_URL = 'blueberry://newtab'

export const DEFAULT_SPACES = [
  { id: 'space-personal', name: 'Personal', color: '#6366f1', icon: '🏠' },
  { id: 'space-work', name: 'Work', color: '#0ea5e9', icon: '💼' },
  { id: 'space-research', name: 'Research', color: '#10b981', icon: '🔬' }
] as const

export const DEFAULT_AI_PROVIDERS: AIProviderConfig[] = [
  { id: 'local-smollm135', label: 'Local SmolLM2-135M (Puny, Free)', enabled: true, baseUrl: 'http://localhost:11435', model: 'HuggingFaceTB/SmolLM2-135M-Instruct' },
  { id: 'ollama', label: 'Ollama (Local)', enabled: true, baseUrl: 'http://localhost:11434', model: 'llama3.1' },
  { id: 'openai', label: 'OpenAI', enabled: false, model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', enabled: false, model: 'claude-3-5-sonnet-latest' },
  { id: 'gemini', label: 'Google Gemini', enabled: false, model: 'gemini-2.0-flash' },
  { id: 'deepseek', label: 'DeepSeek', enabled: false, model: 'deepseek-chat' },
  { id: 'huggingface', label: 'Hugging Face Cloud', enabled: false, model: 'meta-llama/Meta-Llama-3-8B-Instruct' }
]

export const QUICK_ACTIONS = [
  { id: 'summarize-page', label: 'Summarize this page', prompt: 'Summarize this page in concise bullet points.', icon: '📝' },
  { id: 'extract-tables', label: 'Extract tables', prompt: 'Extract all tables from the page as markdown.', icon: '📊' },
  { id: 'find-pricing', label: 'Find pricing plans', prompt: 'Find and summarize pricing plans on this page.', icon: '💰' },
  { id: 'clean-view', label: 'Clean view', prompt: 'Rewrite the page content in clean markdown, stripping ads.', icon: '✨' }
] as const
