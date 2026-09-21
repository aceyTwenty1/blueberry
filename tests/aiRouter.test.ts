import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally for aiRouter
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { chatGecko, chatStreamGecko } from '../src/firefox/extension/background/aiRouter'
import type { AIProviderConfig } from '@shared/types/ai'

const baseReq = {
  messages: [{ id: '1', role: 'user' as const, content: 'hello', timestamp: Date.now() }],
  providerId: 'local-smollm135' as const,
  context: { url: 'https://example.com', title: 'Ex', markdown: 'test', excerpt: 'test' }
}

describe('aiRouter (Gecko)', () => {
  beforeEach(() => fetchMock.mockReset())

  it('routes local-smollm135 to :11435 Ollama-compatible', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'hi from 135M' } })
    } as Response)
    const cfg: AIProviderConfig = { id: 'local-smollm135', label: 'Local', enabled: true, baseUrl: 'http://localhost:11435', model: 'SmolLM2-135M' }
    const text = await chatGecko(baseReq as never, cfg)
    expect(text).toBe('hi from 135M')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11435/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('routes ollama to :11434', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: 'ollama hi' } }) } as Response)
    const cfg: AIProviderConfig = { id: 'ollama', label: 'Ollama', enabled: true, baseUrl: 'http://localhost:11434', model: 'llama3.1' }
    const text = await chatGecko(baseReq as never, cfg)
    expect(fetchMock.mock.calls[0][0]).toContain('11434')
    expect(text).toBe('ollama hi')
  })

  it('routes huggingface to api-inference', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ generated_text: 'hf hi' }] } as Response)
    const cfg: AIProviderConfig = { id: 'huggingface', label: 'HF', enabled: true, apiKey: 'hf_test', model: 'meta-llama/Meta-Llama-3-8B' }
    const text = await chatGecko(baseReq as never, cfg)
    expect(fetchMock.mock.calls[0][0]).toContain('huggingface.co')
    expect(text).toBe('hf hi')
  })

  it('throws on unknown provider', async () => {
    const cfg = { id: 'unknown' as never, label: 'x', enabled: true, model: 'x' }
    await expect(chatGecko(baseReq as never, cfg)).rejects.toThrow('Unknown provider')
  })

  it('streams NDJSON for local', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: 'hello ' } }) + '\n'))
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: 'world' } }) + '\n'))
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ done: true }) + '\n'))
        controller.close()
      }
    })
    fetchMock.mockResolvedValueOnce({ ok: true, body: stream } as unknown as Response)
    const cfg: AIProviderConfig = { id: 'local-smollm135', label: 'Local', enabled: true, baseUrl: 'http://localhost:11435', model: 'm' }
    const chunks: string[] = []
    for await (const c of chatStreamGecko({ ...baseReq, stream: true } as never, cfg)) chunks.push(c)
    expect(chunks.join('')).toBe('hello world')
  })

  it('streams OpenAI SSE deltas until [DONE]', async () => {
    const sse =
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo' } }] })}\n\n` +
      `data: [DONE]\n\n`
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse))
        controller.close()
      }
    })
    fetchMock.mockResolvedValueOnce({ ok: true, body: stream } as unknown as Response)
    const cfg: AIProviderConfig = { id: 'openai', label: 'OpenAI', enabled: true, apiKey: 'sk-test', model: 'gpt-4o-mini' }
    const chunks: string[] = []
    for await (const c of chatStreamGecko({ ...baseReq, stream: true } as never, cfg)) chunks.push(c)
    expect(chunks.join('')).toBe('Hello')
  })

  it('falls back to non-stream when SSE body is missing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, body: null } as unknown as Response)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'fallback' } }] }) } as Response)
    const cfg: AIProviderConfig = { id: 'openai', label: 'OpenAI', enabled: true, apiKey: 'sk-test', model: 'gpt-4o-mini' }
    const chunks: string[] = []
    for await (const c of chatStreamGecko({ ...baseReq, stream: true } as never, cfg)) chunks.push(c)
    expect(chunks.join('')).toBe('fallback')
  })

  it('throws on local stream HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, body: null } as unknown as Response)
    const cfg: AIProviderConfig = { id: 'ollama', label: 'Ollama', enabled: true, baseUrl: 'http://localhost:11434', model: 'llama3.1' }
    await expect(async () => {
      for await (const _c of chatStreamGecko({ ...baseReq, stream: true } as never, cfg)) {
        // drain
      }
    }).rejects.toThrow('Ollama stream 500')
  })
})
