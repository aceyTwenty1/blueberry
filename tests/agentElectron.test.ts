import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ---- Mock Electron before importing main modules (vi.mock is hoisted) ----
const TEST_ROOT = join(tmpdir(), 'bb-agent-test')
vi.mock('electron', () => ({
  app: { getPath: () => TEST_ROOT }
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { runAgentElectron } from '../src/main/ai/agentRunner'
import { agentMemory } from '../src/ai/agent/memory'
import type { AgentEvent } from '@shared/types/agent'

const ctx = {
  url: 'https://example.com/docs',
  title: 'Docs',
  markdown: '# Hello\n\nSome documentation body text for testing.',
  excerpt: 'Docs'
}

const fakeViewManager = {
  createTab: (url: string) => ({ id: 'tab-1', url, title: 't', isLoading: false, canGoBack: false, canGoForward: false, spaceId: 's', createdAt: 0, lastActiveAt: 0 })
}

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
  rmSync(TEST_ROOT, { recursive: true, force: true })
  return agentMemory.clear()
})

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true })
})

async function run(goal: string, planJson: string): Promise<{ events: AgentEvent[]; answer: string }> {
  mockPlanner(planJson)
  const events: AgentEvent[] = []
  const answer = await runAgentElectron(fakeViewManager as never, { goal, context: ctx as never }, (e) =>
    void events.push(e)
  )
  return { events, answer }
}

describe('agent runner (Electron)', () => {
  it('readPage + openTab via viewManager', async () => {
    const { events, answer } = await run(
      'open docs',
      JSON.stringify({
        goal: 'g',
        steps: [
          { id: 's1', label: 'read', tool: 'readPage', args: {} },
          { id: 's2', label: 'open', tool: 'openTab', args: { url: 'https://example.com/docs' } }
        ]
      })
    )
    expect(answer).toBe('FINAL-ANSWER')
    expect(JSON.stringify(events)).toContain('Opened tab tab-1')
  })

  it('composio tools fail closed without config', async () => {
    const { events } = await run('apps?', plan('composioExecute', { toolSlug: 'X' }))
    const tr = events.find((e) => e.type === 'tool_result') as { ok: boolean } | undefined
    expect(tr?.ok).toBe(false)
  })

  it('persists memory turn to userData file', async () => {
    await run('read this', plan('readPage'))
    const memFile = join(TEST_ROOT, 'blueberry-memory.json')
    expect(existsSync(memFile)).toBe(true)
    expect(readFileSync(memFile, 'utf-8')).toContain(ctx.url)
  })

  it('planner fetch failure falls back to readPage and still answers', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ message: { content: 'FINAL-ANSWER' } }) }) as Response)
    const { events, answer } = await run('x', plan('summarizePage'))
    expect(answer).toBe('FINAL-ANSWER')
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})
