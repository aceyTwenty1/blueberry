/**
 * Agentic runner — Gecko (Firefox) adapter.
 * Pure-core executor + per-engine tools (browser.*) + LLM via chatGecko.
 * Memory persisted to storage.local (blueberry:memory).
 */
import { runAgent } from '../../../ai/agent/executor'
import { agentMemory } from '../../../ai/agent/memory'
import { chatGecko } from './aiRouter'
import type { AIProviderConfig } from '../../../shared/types/ai'
import type { AgentEvent, AgentRunRequest, ToolName, ToolResult } from '../../../shared/types/agent'
import { AGENT_LIMITS } from '../../../shared/types/agent'

const MEMORY_KEY = 'blueberry:memory'

export async function loadAgentMemory(): Promise<void> {
  try {
    const data = await browser.storage.local.get(MEMORY_KEY)
    const docs = data[MEMORY_KEY] as Array<Record<string, unknown>> | undefined
    if (Array.isArray(docs)) {
      agentMemory.restore(
        docs as unknown as Parameters<typeof agentMemory.restore>[0]
      )
    }
  } catch {
    // fresh start
  }
}

async function saveAgentMemory(): Promise<void> {
  try {
    await browser.storage.local.set({ [MEMORY_KEY]: agentMemory.snapshot() })
  } catch {
    // non-fatal
  }
}

function extractMarkdownTables(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (buf.length >= 2 && buf.some((l) => /\|.*\|/.test(l) && /---/.test(l))) {
      out.push(buf.join('\n'))
    }
    buf = []
  }
  for (const line of lines) {
    if (/\|/.test(line)) buf.push(line)
    else {
      flush()
    }
  }
  flush()
  return out.length > 0 ? out.join('\n\n') : 'No markdown tables found on this page.'
}

export async function runAgentGecko(
  req: AgentRunRequest,
  getConfig: () => Promise<AIProviderConfig>,
  emit: (e: AgentEvent) => void | Promise<void>
): Promise<string> {
  await loadAgentMemory()
  const cfg = await getConfig()

  const llmChat = async (messages: Array<{ role: string; content: string }>, opts?: { maxTokens?: number }): Promise<string> => {
    return chatGecko(
      {
        messages: messages.map((m) => ({ id: 'm', role: m.role as 'user' | 'assistant', content: m.content, timestamp: Date.now() })),
        providerId: cfg.id,
        context: req.context as never,
        maxTokens: opts?.maxTokens ?? 512
      } as never,
      cfg
    )
  }

  const runTool = async (tool: ToolName, args: Record<string, unknown>): Promise<ToolResult> => {
    switch (tool) {
      case 'readPage': {
        const maxChars = typeof args['maxChars'] === 'number' ? Math.min(args['maxChars'] as number, 8000) : AGENT_LIMITS.maxContextChars
        const md = (req.context?.markdown ?? '').slice(0, maxChars)
        return { ok: true, result: md || 'No page context attached.' }
      }
      case 'searchMemory': {
        const query = String(args['query'] ?? req.goal)
        const k = typeof args['k'] === 'number' ? Math.min(args['k'] as number, 5) : AGENT_LIMITS.maxMemoryHits
        const hits = await agentMemory.recall(query, k)
        if (hits.length === 0) return { ok: true, result: 'No relevant memory.' }
        return {
          ok: true,
          result: hits.map((h) => `- ${h.doc.title} (${h.doc.url}) [score ${h.score.toFixed(1)}]: ${h.doc.text.slice(0, 300)}`).join('\n')
        }
      }
      case 'recallHistory': {
        const k = typeof args['k'] === 'number' ? Math.min(args['k'] as number, 10) : 5
        const recent = await agentMemory.recent(k)
        if (recent.length === 0) return { ok: true, result: 'No history yet.' }
        return { ok: true, result: recent.map((d) => `- ${d.title} (${d.url})`).join('\n') }
      }
      case 'openTab': {
        const url = String(args['url'] ?? '')
        try {
          const tab = await browser.tabs.create({ url })
          return { ok: true, result: `Opened tab ${tab.id ?? ''} → ${url}` }
        } catch (e) {
          return { ok: false, result: `openTab failed: ${String(e).slice(0, 200)}` }
        }
      }
      case 'summarizePage': {
        const md = (req.context?.markdown ?? '').slice(0, AGENT_LIMITS.maxContextChars)
        if (!md) return { ok: true, result: 'No page context.' }
        const summary = await llmChat([
          { role: 'system', content: 'Summarize in 5 concise markdown bullets. Keep numbers and links.' },
          { role: 'user', content: `Page: ${req.context?.title ?? ''}\n\n${md}` }
        ])
        return { ok: true, result: summary }
      }
      case 'extractTables': {
        const md = req.context?.markdown ?? ''
        return { ok: true, result: extractMarkdownTables(md).slice(0, 4000) }
      }
    }
  }

  const answer = await runAgent(req, {
    llmChat,
    runTool,
    emit,
    confirm: async () => true // background cannot prompt; sidebar shows result and user can close tab
  })

  // Index this turn into memory for future recall
  try {
    if (req.context?.url) {
      await agentMemory.add({
        id: `${req.context.url}#${Date.now()}`,
        url: req.context.url,
        title: req.context.title,
        text: `${req.goal}\n${answer}`.slice(0, 2000)
      })
      await saveAgentMemory()
    }
  } catch {
    // non-fatal
  }
  return answer
}
