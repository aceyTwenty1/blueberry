/**
 * Blueberry AI Router — Gecko (Firefox) version
 * Runs in background script (WebExtension, not Node). Uses fetch() with host permissions (<all_urls>).
 * Mirrors src/ai/providers/index.ts but Gecko-compatible (no Node SDKs, no `openai` npm in background).
 * For Ollama local, OpenAI, Anthropic, Gemini, DeepSeek — all via fetch.
 */

import type { AIProviderId, ChatRequest, PageContext } from '../../../shared/types/ai'
import type { AIProviderConfig } from '../../../shared/types/ai'

// Shared prompt builder (from src/ai/scraper/extractor.ts SYSTEM_PROMPTS)
const SYSTEM_PROMPTS: Record<string, string> = {
  summarize: 'You are Blueberry AI, an expert web summarizer. Produce concise bullet points, preserve key facts, numbers, links. Use markdown.',
  qa: 'You are Blueberry AI. Answer questions grounded in the provided page context. Cite snippets. If not in context, say so.',
  extract: 'You are Blueberry AI. Extract structured data as requested, return valid JSON or markdown tables.',
  general: 'You are Blueberry AI, a helpful in-browser co-pilot for Firefox. Be concise, friendly, and web-aware.'
}

function buildSystemPrompt(task: string, ctx?: PageContext): string {
  const base = SYSTEM_PROMPTS[task] ?? SYSTEM_PROMPTS.general
  if (!ctx) return base
  return `${base}\n\n## Page Context\nTitle: ${ctx.title}\nURL: ${ctx.url}\n\n${ctx.markdown.slice(0, 6000)}`
}

function toOpenAIWire(req: ChatRequest, config: AIProviderConfig): { url: string; body: unknown; headers: Record<string,string> } {
  const system = buildSystemPrompt((req as unknown as { task?: string }).task ?? 'general', req.context)
  const messages = [
    { role: 'system', content: system },
    ...req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
  ]
  // Provider-specific URL/model — local open-source models are Ollama-compatible (sidecar on 11435)
  if (config.id === 'ollama' || config.id === 'local-smollm135' || config.id.startsWith('local-')) {
    return {
      url: `${config.baseUrl ?? (config.id === 'local-smollm135' ? 'http://localhost:11435' : 'http://localhost:11434')}/api/chat`,
      headers: { 'Content-Type': 'application/json' },
      body: { model: config.model, messages, stream: !!req.stream }
    }
  }
  if (config.id === 'huggingface') {
    // HF Inference API (cloud) — uses same messages
    return {
      url: `https://api-inference.huggingface.co/models/${config.model}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: { inputs: messages.map(m => `${m.role}: ${m.content}`).join('\n\n'), parameters: { max_new_tokens: req.maxTokens ?? 256, temperature: req.temperature ?? 0.7 } }
    }
  }
  if (config.id === 'openai' || config.id === 'deepseek') {
    const base = config.baseUrl ?? (config.id === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com')
    return {
      url: `${base}/v1/chat/completions`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: { model: config.model, messages, temperature: req.temperature ?? 0.3, max_tokens: req.maxTokens, stream: !!req.stream }
    }
  }
  if (config.id === 'anthropic') {
    // Anthropic messages API
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      body: { model: config.model, system, messages: messages.filter(m => m.role !== 'system'), max_tokens: req.maxTokens ?? 1024, stream: !!req.stream }
    }
  }
  if (config.id === 'gemini') {
    // Gemini generateContent
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        system_instruction: { parts: [{ text: system }] }
      }
    }
  }
  throw new Error(`Unknown provider ${config.id}`)
}

export async function chatGecko(req: ChatRequest, config: AIProviderConfig): Promise<string> {
  const { url, body, headers } = toOpenAIWire({ ...req, stream: false }, config)

  // Ollama / local open-source sidecar non-stream (same NDJSON shape)
  if (config.id === 'ollama' || config.id === 'local-smollm135' || config.id.startsWith('local-')) {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`${config.id} ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { message?: { content: string }; response?: string; error?: string; generated_text?: string }
    if (json.error) throw new Error(json.error)
    return json.message?.content ?? json.response ?? json.generated_text ?? ''
  }
  if (config.id === 'huggingface') {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`HuggingFace ${res.status}: ${await res.text()}`)
    const json = await res.json() as Array<{ generated_text?: string }> | { generated_text?: string; error?: string }
    if (Array.isArray(json)) return json[0]?.generated_text ?? ''
    if ((json as { error?: string }).error) throw new Error((json as { error: string }).error)
    return (json as { generated_text?: string }).generated_text ?? JSON.stringify(json).slice(0, 2000)
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${config.id} ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = await res.json() as Record<string, unknown>
  // OpenAI/DeepSeek shape
  if (json.choices) {
    const c = (json.choices as Array<{ message?: { content: string }; delta?: { content: string } }>)[0]
    return c?.message?.content ?? c?.delta?.content ?? ''
  }
  // Anthropic
  if (json.content) {
    const content = json.content as Array<{ text?: string }>
    return content.map(c => c.text ?? '').join('\n')
  }
  // Gemini
  if (json.candidates) {
    const cand = (json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>)[0]
    return cand?.content?.parts?.map(p => p.text ?? '').join('\n') ?? ''
  }
  return JSON.stringify(json).slice(0, 2000)
}

export async function* chatStreamGecko(req: ChatRequest, config: AIProviderConfig): AsyncGenerator<string> {
  const { url, body, headers } = toOpenAIWire({ ...req, stream: true }, config)

  // Ollama / local streaming: NDJSON
  if (config.id === 'ollama' || config.id === 'local-smollm135' || config.id.startsWith('local-')) {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok || !res.body) throw new Error(`Ollama stream ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const j = JSON.parse(line) as { message?: { content: string }; done?: boolean }
          if (j.message?.content) yield j.message.content
          if (j.done) return
        } catch {}
      }
    }
    return
  }

  // OpenAI-compatible SSE streaming
  const res = await fetch(url, { method: 'POST', headers: { ...headers, Accept: 'text/event-stream' }, body: JSON.stringify(body) })
  if (!res.ok || !res.body) {
    // Fallback to non-stream
    const text = await chatGecko({ ...req, stream: false }, config)
    yield text
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>; content?: unknown }
        const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''
        if (delta) yield delta
      } catch {}
    }
  }
}
