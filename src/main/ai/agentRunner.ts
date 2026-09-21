/**
 * Agentic runner — Electron (Chromium) adapter.
 * Uses ViewManager for page context/tabs, store for providers, fetch for local sidecar.
 * Memory persisted to userData/blueberry-memory.json.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import type { ViewManager } from '../windows/viewManager'
import { store } from '../utils/store'
import { runAgent } from '@ai/agent/executor'
import { agentMemory } from '@ai/agent/memory'
import { composioManageConnections, composioMultiExecute, composioSearchTools } from '@ai/agent/composio'
import type { AIProviderConfig } from '@shared/types/ai'
import type { AgentEvent, AgentRunRequest, ToolName, ToolResult } from '@shared/types/agent'
import { AGENT_LIMITS } from '@shared/types/agent'

function memoryPath(): string {
  try {
    return join(app.getPath('userData'), 'blueberry-memory.json')
  } catch {
    return join(process.cwd(), '.blueberry-memory.json')
  }
}

async function loadMemory(): Promise<void> {
  try {
    const p = memoryPath()
    if (!existsSync(p)) return
    const docs = JSON.parse(readFileSync(p, 'utf-8')) as Parameters<typeof agentMemory.restore>[0]
    if (Array.isArray(docs)) agentMemory.restore(docs)
  } catch {
    // fresh
  }
}

async function saveMemory(): Promise<void> {
  try {
    const p = memoryPath()
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(agentMemory.snapshot(), null, 2), 'utf-8')
  } catch (e) {
    console.warn('[agentMemory] save failed', e)
  }
}

function extractMarkdownTables(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (buf.length >= 2 && buf.some((l) => /\|.*\|/.test(l) && /---/.test(l))) out.push(buf.join('\n'))
    buf = []
  }
  for (const line of lines) {
    if (/\|/.test(line)) buf.push(line)
    else flush()
  }
  flush()
  return out.length > 0 ? out.join('\n\n') : 'No markdown tables found on this page.'
}

export async function runAgentElectron(
  viewManager: ViewManager,
  req: AgentRunRequest,
  emit: (e: AgentEvent) => void | Promise<void>
): Promise<string> {
  await loadMemory()
  const cfg: AIProviderConfig =
    (req.providerId ? store.getProvider(req.providerId) : null) ?? store.getProviders()[0]!
  const composioCfg = store.getComposio()

  const requireComposio = () => {
    if (!composioCfg.enabled || !composioCfg.consumerKey) {
      throw new Error('Composio not configured. Set the consumer key in Blueberry Settings → Composio.')
    }
    return composioCfg
  }

  const llmChat = async (messages: Array<{ role: string; content: string }>, opts?: { maxTokens?: number }): Promise<string> => {
    // Local sidecar path (Ollama-compatible) — same contract as fetchLocalChat in handlers.ts
    if (cfg.id === 'local-smollm135' || cfg.id === 'ollama' || cfg.id.startsWith('local-')) {
      const url = `${cfg.baseUrl ?? (cfg.id === 'local-smollm135' ? 'http://localhost:11435' : 'http://localhost:11434')}/api/chat`
      const body = { model: cfg.model, messages, stream: false, max_tokens: opts?.maxTokens }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`${cfg.id} ${res.status}: ${await res.text()}`)
      const j = (await res.json()) as { message?: { content: string }; response?: string; generated_text?: string; error?: string }
      if (j.error) throw new Error(j.error)
      return j.message?.content ?? j.response ?? j.generated_text ?? ''
    }
    throw new Error(`[${cfg.id}] Electron agent currently supports local providers only. Use Firefox for cloud.`)
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
        return { ok: true, result: hits.map((h) => `- ${h.doc.title} (${h.doc.url}) [${h.score.toFixed(1)}]: ${h.doc.text.slice(0, 300)}`).join('\n') }
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
          const tab = viewManager.createTab(url)
          return { ok: true, result: `Opened tab ${tab.id} → ${url}` }
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
        return { ok: true, result: extractMarkdownTables(req.context?.markdown ?? '').slice(0, 4000) }
      }
      case 'composioSearch': {
        try {
          const text = await composioSearchTools(requireComposio(), String(args['query'] ?? req.goal))
          return { ok: true, result: text }
        } catch (e) {
          return { ok: false, result: `composioSearch failed: ${String(e).slice(0, 300)}` }
        }
      }
      case 'composioExecute': {
        try {
          const toolSlug = String(args['toolSlug'] ?? '')
          let toolArgs: Record<string, unknown> = {}
          if (typeof args['argsJson'] === 'string' && (args['argsJson'] as string).trim()) {
            try {
              toolArgs = JSON.parse(args['argsJson'] as string) as Record<string, unknown>
            } catch {
              return { ok: false, result: 'composioExecute argsJson is not valid JSON.' }
            }
          }
          const account = typeof args['account'] === 'string' ? (args['account'] as string) : undefined
          const res = await composioMultiExecute(requireComposio(), [{ toolSlug, args: toolArgs, account }], req.goal)
          return { ok: res.ok, result: res.text || '(empty result)' }
        } catch (e) {
          return { ok: false, result: `composioExecute failed: ${String(e).slice(0, 300)}` }
        }
      }
      case 'composioConnect': {
        try {
          const toolkit = String(args['toolkit'] ?? '').toLowerCase()
          const infos = await composioManageConnections(requireComposio(), [toolkit])
          const lines = infos.map((i) => {
            if (i.status === 'active') return `${i.toolkit}: ACTIVE${i.accounts?.length ? ` (${i.accounts.length} account(s))` : ''}`
            if (i.status === 'initiated' && i.redirectUrl)
              return `${i.toolkit}: needs user action — open this link: ${i.redirectUrl} (expires ~10 min)`
            return `${i.toolkit}: ${i.status}`
          })
          return { ok: true, result: lines.join('\n') }
        } catch (e) {
          return { ok: false, result: `composioConnect failed: ${String(e).slice(0, 300)}` }
        }
      }
    }
  }

  const answer = await runAgent(req, {
    llmChat,
    runTool,
    emit,
    confirm: async () => true // renderer shows result; user can close tab. Future: dialog.
  })

  try {
    if (req.context?.url) {
      await agentMemory.add({
        id: `${req.context.url}#${Date.now()}`,
        url: req.context.url,
        title: req.context.title,
        text: `${req.goal}\n${answer}`.slice(0, 2000)
      })
      await saveMemory()
    }
  } catch {
    // non-fatal
  }
  return answer
}
