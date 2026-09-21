import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally for the pure MCP client
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import {
  parseSseMessages,
  mcpRpc,
  mcpResultText,
  composioSearchTools,
  composioMultiExecute,
  composioManageConnections,
  composioListTools
} from '../src/ai/agent/composio'
import { validateToolCall } from '../src/ai/agent/tools'
import { buildPlannerPrompt, parsePlan } from '../src/ai/agent/planner'
import type { ComposioConfig } from '@shared/types/composio'

const cfg: ComposioConfig = { enabled: true, baseUrl: 'https://connect.composio.dev/mcp', consumerKey: 'ck_test' }

function sseRpc(id: number, result: unknown): string {
  return `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`
}

function sseContent(text: string): string {
  return sseRpc(2, { content: [{ type: 'text', text }] })
}

describe('composio SSE parsing', () => {
  it('parses data frames, skips noise and [DONE]', () => {
    const body = 'event: message\ndata: {"a":1}\n\n:keepalive\n\ndata: [DONE]\n\ndata: {"b":2}\n\n'
    const msgs = parseSseMessages(body)
    expect(msgs).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('ignores malformed frames', () => {
    expect(parseSseMessages('data: {oops\n\ndata: {"ok":true}\n\n')).toEqual([{ ok: true }])
  })

  it('extracts concatenated text from content blocks', () => {
    expect(mcpResultText({ result: { content: [{ text: 'hi' }, { text: 'there' }] } })).toBe('hi\nthere')
    expect(mcpResultText({})).toBe('')
  })
})

describe('composio MCP client', () => {
  beforeEach(() => fetchMock.mockReset())

  it('throws without consumer key', async () => {
    await expect(mcpRpc({ enabled: true, baseUrl: cfg.baseUrl }, 'tools/list', {}, 1)).rejects.toThrow('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends consumer-key header + JSON-RPC envelope', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => sseRpc(1, { tools: [] }) } as Response)
    await mcpRpc(cfg, 'tools/list', {}, 7)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://connect.composio.dev/mcp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, params: {} })
      })
    )
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['x-consumer-api-key']).toBe('ck_test')
  })

  it('matches response by id', async () => {
    const body = sseRpc(99, { tools: [] }) + sseRpc(7, { tools: [{ name: 'X' }] })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => body } as Response)
    const rpc = await mcpRpc(cfg, 'tools/list', {}, 7)
    expect((rpc.result as { tools: Array<{ name: string }> }).tools[0]!.name).toBe('X')
  })

  it('maps RPC errors', async () => {
    const body = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'boom' } })}\n\n`
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => body } as Response)
    await expect(mcpRpc(cfg, 'tools/call', { name: 'X', arguments: {} }, 2)).rejects.toThrow('boom')
  })

  it('lists meta tools', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => sseRpc(1, { tools: [{ name: 'COMPOSIO_SEARCH_TOOLS', description: 'search' }] })
    } as Response)
    const tools = await composioListTools(cfg)
    expect(tools).toEqual([{ name: 'COMPOSIO_SEARCH_TOOLS', description: 'search' }])
  })

  it('search passes query through', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => sseContent('{"data":"found"}') } as Response)
    const text = await composioSearchTools(cfg, 'gmail fetch emails')
    expect(text).toContain('found')
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(sent.params.arguments.query).toBe('gmail fetch emails')
  })

  it('multi-execute puts account at item level', async () => {
    const okPayload = JSON.stringify({ data: { success_count: 1, error_count: 0, results: [] } })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => sseContent(okPayload) } as Response)
    const res = await composioMultiExecute(
      cfg,
      [{ toolSlug: 'GMAIL_FETCH_EMAILS', args: { user_id: 'me' }, account: 'gmail_losing-crux' }],
      'fetch mail'
    )
    expect(res.ok).toBe(true)
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const item = sent.params.arguments.tools[0]
    expect(item.tool_slug).toBe('GMAIL_FETCH_EMAILS')
    expect(item.account).toBe('gmail_losing-crux')
    expect(sent.params.arguments.thought).toBe('fetch mail')
    expect(sent.params.arguments.memory).toEqual({})
  })

  it('multi-execute flags failures', async () => {
    const failPayload = JSON.stringify({ data: { success_count: 0, error_count: 1, results: [] } })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => sseContent(failPayload) } as Response)
    const res = await composioMultiExecute(cfg, [{ toolSlug: 'X', args: {} }])
    expect(res.ok).toBe(false)
  })

  it('parses connection statuses + redirect links', async () => {
    const payload = JSON.stringify({
      data: {
        results: {
          gmail: { toolkit: 'gmail', status: 'active', accounts: [{ id: 'a1', status: 'active', is_default: true }] },
          outlook: { toolkit: 'outlook', status: 'initiated', redirect_url: 'https://connect.example/lk_1', accounts: [] }
        }
      }
    })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => sseContent(payload) } as Response)
    const infos = await composioManageConnections(cfg, ['gmail', 'outlook'])
    expect(infos).toHaveLength(2)
    expect(infos[0]).toMatchObject({ toolkit: 'gmail', status: 'active' })
    expect(infos[0]!.accounts?.[0]?.id).toBe('a1')
    expect(infos[1]).toMatchObject({ toolkit: 'outlook', status: 'initiated', redirectUrl: 'https://connect.example/lk_1' })
  })
})

describe('composio agent tools', () => {
  it('validates the three new tools', () => {
    expect(validateToolCall('composioSearch', { query: 'x' }).ok).toBe(true)
    expect(validateToolCall('composioSearch', {}).ok).toBe(false)
    expect(validateToolCall('composioExecute', { toolSlug: 'GMAIL_FETCH_EMAILS' }).ok).toBe(true)
    expect(validateToolCall('composioExecute', {}).ok).toBe(false)
    expect(validateToolCall('composioConnect', { toolkit: 'gmail' }).ok).toBe(true)
    expect(validateToolCall('composioConnect', {}).ok).toBe(false)
  })

  it('planner mentions composio + accepts composio steps', () => {
    const prompt = buildPlannerPrompt('check my gmail', 'general', false, 'none')
    expect(prompt).toContain('composioConnect')
    expect(prompt).toContain('NEVER invent tool slugs')
    const plan = parsePlan(
      JSON.stringify({
        goal: 'check gmail',
        steps: [
          { id: 's1', label: 'Connect', tool: 'composioConnect', args: { toolkit: 'gmail' } },
          { id: 's2', label: 'Search', tool: 'composioSearch', args: { query: 'gmail fetch emails' } },
          { id: 's3', label: 'Fetch', tool: 'composioExecute', args: { toolSlug: 'GMAIL_FETCH_EMAILS', argsJson: '{"user_id":"me"}' } }
        ]
      }),
      'check gmail'
    )
    expect(plan.steps).toHaveLength(3)
    expect(plan.steps[2]!.tool).toBe('composioExecute')
  })
})
