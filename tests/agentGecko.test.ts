import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Stub WebExtension browser global before importing the runner ----
const memStore: Record<string, unknown> = {}
let tabsCreateImpl: (opts: { url: string }) => Promise<{ id?: number }> = async () => ({ id: 5 })

vi.stubGlobal('browser', {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memStore[key] }),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(memStore, obj)
      }
    }
  },
  tabs: {
    create: (opts: { url: string }) => tabsCreateImpl(opts)
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: async () => null
  }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { runAgentGecko } from '../src/firefox/extension/background/agent'
import { agentMemory } from '../src/ai/agent/memory'
import type { AgentEvent } from '@shared/types/agent'
import type { AIProviderConfig } from '@shared/types/ai'

const localCfg: AIProviderConfig = {
  id: 'local-smollm135',
  label: 'Local',
  enabled: true,
  baseUrl: 'http://localhost:11435',
  model: 'm'
}

const ctx = {
  url: 'https://example.com/pricing',
  title: 'Pricing',
  markdown: '| Plan | Price |\n|---|---|\n| Free | $0 |\n| Pro | $20 |\nSome body text here.',
  excerpt: 'Pricing'
}

/** Route mocked fetch: planner prompt → plan JSON, anything else → canned answer */
function mockPlanner(planJson: string, answer = 'FINAL-ANSWER') {
  fetchMock.mockImplementation(async (_url: unknown, opts: { body?: string } | undefined) => {
    const body = JSON.parse((opts?.body as string) ?? '{}') as { messages?: Array<{ content?: string }> }
    const text = (body.messages ?? []).map((m) => m.content ?? '').join('\n')
    const reply = text.includes('You are Blueberry planner') ? planJson : answer
    return { ok: true, json: async () => ({ message: { content: reply } }) } as Response
  })
}

const plan = (tool: string, args: Record<string, unknown> = {}) =>
  JSON.stringify({ goal: 'g', steps: [{ id: 's1', label: 'step', tool, args }] })

beforeEach(() => {
  fetchMock.mockReset()
  for (const k of Object.keys(memStore)) delete memStore[k]
  tabsCreateImpl = async () => ({ id: 5 })
  return agentMemory.clear()
})

async function run(goal: string, planJson: string, answer = 'FINAL-ANSWER'): Promise<{ events: AgentEvent[]; answer: string }> {
  mockPlanner(planJson, answer)
  const events: AgentEvent[] = []
  const out = await runAgentGecko(
    { goal, context: ctx as never },
    async () => localCfg,
    (e) => void events.push(e)
  )
  return { events, answer: out }
}

describe('agent runner (Gecko)', () => {
  it('readPage respects maxChars', async () => {
    const { events } = await run('summarize', plan('readPage', { maxChars: 10 }))
    const tr = events.find((e) => e.type === 'tool_result') as { result: string } | undefined
    expect(tr).toBeDefined()
    expect(tr!.result.length).toBeLessThanOrEqual(10)
  })

  it('searchMemory + recallHistory hit seeded memory', async () => {
    await agentMemory.add({ id: 'm1', url: 'https://x.com', title: 'Pricing plans compared', text: 'pro plan twenty dollars' })
    const { events } = await run(
      'pricing?',
      JSON.stringify({
        goal: 'g',
        steps: [
          { id: 's1', label: 'mem', tool: 'searchMemory', args: { query: 'pricing plans' } },
          { id: 's2', label: 'hist', tool: 'recallHistory', args: { k: 5 } }
        ]
      })
    )
    const texts = events.filter((e) => e.type === 'tool_result').map((e) => (e as { result: string }).result)
    expect(texts[0]).toContain('Pricing plans compared')
    expect(texts[1]).toContain('https://x.com')
  })

  it('openTab success and failure', async () => {
    const ok = await run('open', plan('openTab', { url: 'https://example.com' }))
    expect(JSON.stringify(ok.events)).toContain('Opened tab 5')
    tabsCreateImpl = async () => {
      throw new Error('denied')
    }
    const fail = await run('open', plan('openTab', { url: 'https://example.com' }))
    const tr = fail.events.find((e) => e.type === 'tool_result') as { ok: boolean } | undefined
    expect(tr?.ok).toBe(false)
  })

  it('extractTables finds tables, reports absence', async () => {
    const { events } = await run('tables?', plan('extractTables'))
    const tr = events.find((e) => e.type === 'tool_result') as { result: string } | undefined
    expect(tr!.result).toContain('| Plan | Price |')
  })

  it('summarizePage calls the LLM', async () => {
    const { events } = await run('summarize', plan('summarizePage'))
    const tr = events.find((e) => e.type === 'tool_result') as { result: string } | undefined
    expect(tr!.result).toBe('FINAL-ANSWER')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('composio tools fail closed without config', async () => {
    for (const [tool, args] of [
      ['composioSearch', { query: 'gmail' }],
      ['composioExecute', { toolSlug: 'GMAIL_FETCH_EMAILS' }],
      ['composioConnect', { toolkit: 'gmail' }]
    ] as Array<[string, Record<string, unknown>]>) {
      const { events } = await run('apps?', plan(tool, args))
      const tr = events.find((e) => e.type === 'tool_result') as { ok: boolean; result: string } | undefined
      expect(tr?.ok).toBe(false)
      expect(tr?.result).toMatch(/not configured/i)
    }
  })

  it('composioExecute rejects invalid argsJson', async () => {
    // storage has composio enabled so we get past the config gate
    memStore['blueberry:composio'] = { enabled: true, baseUrl: 'https://connect.composio.dev/mcp', consumerKey: 'ck_test' }
    const { events } = await run('apps?', plan('composioExecute', { toolSlug: 'X', argsJson: '{oops' }))
    const tr = events.find((e) => e.type === 'tool_result') as { result: string } | undefined
    expect(tr!.result).toMatch(/not valid JSON/i)
  })

  it('indexes the turn into memory', async () => {
    await run('summarize this', plan('readPage'))
    const docs = await agentMemory.list()
    expect(docs.some((d) => d.url === ctx.url)).toBe(true)
  })
})
