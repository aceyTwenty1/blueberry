import { describe, it, expect } from 'vitest'
import { validateToolCall } from '@ai/agent/tools'
import { parsePlan, buildPlannerPrompt } from '@ai/agent/planner'
import { AgentMemory } from '@ai/agent/memory'
import { runAgent } from '@ai/agent/executor'
import type { AgentEvent, ToolName, ToolResult } from '@shared/types/agent'

describe('agent tools', () => {
  it('validates known tools', () => {
    expect(validateToolCall('readPage', {}).ok).toBe(true)
    expect(validateToolCall('searchMemory', { query: 'pricing' }).ok).toBe(true)
    expect(validateToolCall('nope', {}).ok).toBe(false)
    expect(validateToolCall('searchMemory', {}).ok).toBe(false)
    expect(validateToolCall('openTab', { url: 'not-a-url' }).ok).toBe(false)
    expect(validateToolCall('openTab', { url: 'https://example.com' }).ok).toBe(true)
  })

  it('builds planner prompt with tools + goal', () => {
    const p = buildPlannerPrompt('Summarize pricing', 'extract', true, 'Docs')
    expect(p).toContain('Summarize pricing')
    expect(p).toContain('readPage')
    expect(p).toContain('ONLY JSON')
  })
})

describe('agent planner', () => {
  it('parses valid plan JSON', () => {
    const raw = JSON.stringify({
      goal: 'g',
      steps: [
        { id: 's1', label: 'Read', tool: 'readPage', args: {} },
        { id: 's2', label: 'Search', tool: 'searchMemory', args: { query: 'pricing' } }
      ]
    })
    const plan = parsePlan(raw, 'g')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0]!.tool).toBe('readPage')
  })

  it('parses array form + filters bad tools', () => {
    const raw = `[{"id":"s1","label":"x","tool":"readPage","args":{}},{"id":"s2","label":"y","tool":"evil","args":{}}]`
    const plan = parsePlan(raw, 'g')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]!.tool).toBe('readPage')
  })

  it('falls back on garbage', () => {
    const plan = parsePlan('not json at all!!!', 'my goal')
    expect(plan.goal).toBe('my goal')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]!.tool).toBe('readPage')
  })

  it('caps at 5 steps', () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, label: 'x', tool: 'readPage', args: {} }))
    const plan = parsePlan(JSON.stringify({ goal: 'g', steps }), 'g')
    expect(plan.steps.length).toBeLessThanOrEqual(5)
  })
})

describe('agent memory', () => {
  it('scores title matches higher', async () => {
    const mem = new AgentMemory()
    await mem.add({ id: '1', url: 'https://a.com', title: 'Pricing plans compared', text: 'unrelated body words here' })
    await mem.add({ id: '2', url: 'https://b.com', title: 'Random article', text: 'pricing plans compared in body text here' })
    const hits = await mem.recall('pricing plans', 2)
    expect(hits[0]!.doc.id).toBe('1')
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)
  })

  it('returns empty on no match', async () => {
    const mem = new AgentMemory()
    await mem.add({ id: '1', url: 'https://a.com', title: 'Cats', text: 'feline whiskers' })
    expect(await mem.recall('quantum chromodynamics', 3)).toHaveLength(0)
  })

  it('recent() orders by recency', async () => {
    const mem = new AgentMemory()
    await mem.add({ id: 'old', url: 'https://a.com', title: 'Old', text: 'old' })
    await new Promise((r) => setTimeout(r, 5))
    await mem.add({ id: 'new', url: 'https://b.com', title: 'New', text: 'new' })
    const recent = await mem.recent(2)
    expect(recent[0]!.id).toBe('new')
  })
})

describe('agent executor', () => {
  async function collectEvents(
    llmBehavior: (call: number) => Promise<string>,
    tools: Partial<Record<ToolName, (args: Record<string, unknown>) => Promise<ToolResult>>>
  ): Promise<{ events: AgentEvent[]; answer: string; toolCalls: Array<{ tool: ToolName; args: Record<string, unknown> }> }> {
    const events: AgentEvent[] = []
    const toolCalls: Array<{ tool: ToolName; args: Record<string, unknown> }> = []
    let llmCalls = 0
    const answer = await runAgent(
      { goal: 'Summarize pricing', task: 'extract', maxSteps: 5 },
      {
        llmChat: async () => llmBehavior(++llmCalls),
        runTool: async (tool, args) => {
          toolCalls.push({ tool, args })
          const fn = tools[tool]
          if (fn) return fn(args)
          return { ok: true, result: `${tool} done` }
        },
        emit: (e) => {
          events.push(e)
        }
      }
    )
    return { events, answer, toolCalls }
  }

  it('runs plan → tools → done in order', async () => {
    const planJson = JSON.stringify({
      goal: 'Summarize pricing',
      steps: [
        { id: 's1', label: 'Read', tool: 'readPage', args: {} },
        { id: 's2', label: 'Search', tool: 'searchMemory', args: { query: 'pricing' } }
      ]
    })
    const { events, answer, toolCalls } = await collectEvents(
      async (call) => (call === 1 ? planJson : 'Final answer here'),
      {
        readPage: async () => ({ ok: true, result: 'page text about pricing tiers' }),
        searchMemory: async () => ({ ok: true, result: 'memory: pro plan $20' })
      }
    )
    expect(events[0]!.type).toBe('plan')
    expect(toolCalls.map((c) => c.tool)).toEqual(['readPage', 'searchMemory'])
    expect(events.map((e) => e.type)).toEqual(['plan', 'tool_start', 'tool_result', 'tool_start', 'tool_result', 'done'])
    expect(answer).toBe('Final answer here')
  })

  it('falls back to direct answer when planner throws', async () => {
    const { events, answer } = await collectEvents(
      async (call) => {
        if (call === 1) throw new Error('planner down')
        return 'Direct answer'
      },
      { readPage: async () => ({ ok: true, result: 'page text' }) }
    )
    expect(events[0]!.type).toBe('plan')
    expect(answer).toBe('Direct answer')
  })

  it('respects confirm declining openTab', async () => {
    const events: AgentEvent[] = []
    const planJson = JSON.stringify({
      goal: 'go somewhere',
      steps: [{ id: 's1', label: 'Open', tool: 'openTab', args: { url: 'https://example.com' } }]
    })
    let llmCalls = 0
    let toolRan = false
    await runAgent(
      { goal: 'go somewhere', confirmOpenTab: true },
      {
        llmChat: async () => (++llmCalls === 1 ? planJson : 'done answer'),
        runTool: async () => {
          toolRan = true
          return { ok: true, result: 'opened' }
        },
        emit: (e) => {
          events.push(e)
        },
        confirm: async () => false
      }
    )
    expect(toolRan).toBe(false)
    expect(events.some((e) => e.type === 'tool_result' && (e as { result: string }).result.includes('declined'))).toBe(true)
  })
})
