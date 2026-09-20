/**
 * IPC handlers — bridge renderer <-> main (tabs, spaces, AI, app).
 * Strictly typed via shared IpcInvokeMap; renderer calls via window.api.invoke
 */
import { ipcMain, app } from 'electron'
import type { ViewManager } from '../windows/viewManager'
import { store } from '../utils/store'
import type { CreateTabOptions, TabId, TabUpdatePayload } from '@shared/types/tab'
import type { AIProviderConfig, AIProviderId, ChatRequest, PageContext } from '@shared/types/ai'
import { DEFAULT_URL } from '@shared/constants/defaults'
import { normalizeUrl } from '@shared/utils/helpers'

// Spaces are lightweight for Step 1 (no persistence beyond defaults)
import { DEFAULT_SPACES } from '@shared/constants/defaults'

let activeSpaceId: string = DEFAULT_SPACES[0]!.id

export function registerIpcHandlers(viewManager: ViewManager): void {
  // Tabs
  ipcMain.handle('tabs:create', (_e, opts: CreateTabOptions) => {
    const url = opts.url ? normalizeUrl(opts.url) : DEFAULT_URL
    const spaceId = opts.spaceId ?? activeSpaceId
    const tab = viewManager.createTab(url, spaceId)
    if (opts.active === false && viewManager.getActiveTabId() !== tab.id) {
      // keep previous active; viewManager already activated, so we need to restore previous
      // For v1 we keep simple: newly created is active. Future: support background tabs.
    }
    return tab
  })

  ipcMain.handle('tabs:close', (_e, id: TabId) => {
    viewManager.closeTab(id)
  })

  ipcMain.handle('tabs:activate', (_e, id: TabId) => {
    viewManager.activateTab(id)
  })

  ipcMain.handle('tabs:list', () => viewManager.listTabs())

  ipcMain.handle('tabs:navigate', (_e, payload: { id: TabId; url: string }) => {
    const url = normalizeUrl(payload.url)
    viewManager.navigate(payload.id, url)
  })

  ipcMain.handle('tabs:navigation', (_e, payload: { id: TabId; action: 'back' | 'forward' | 'reload' | 'stop' }) => {
    viewManager.go(payload.id, payload.action)
  })

  ipcMain.handle('tabs:update', (_e, payload: TabUpdatePayload) => {
    // renderer-initiated metadata update (rare, e.g., favicon)
    const tab = viewManager.getTab(payload.id)
    if (!tab) return
    if (payload.title !== undefined) tab.title = payload.title
    if (payload.favicon !== undefined) tab.favicon = payload.favicon
  })

  // Spaces
  ipcMain.handle('spaces:list', () => {
    return DEFAULT_SPACES.map((s) => ({
      ...s,
      tabIds: viewManager.listTabs().filter((t) => t.spaceId === s.id).map((t) => t.id)
    }))
  })

  ipcMain.handle('spaces:create', (_e, name: string) => {
    // Step 1: ephemeral (not persisted) — returns a synthetic space
    const id = `space-${Date.now()}`
    return { id, name, color: '#6366f1', icon: '📁', tabIds: [] }
  })

  ipcMain.handle('spaces:activate', (_e, id: string) => {
    activeSpaceId = id
    // Filter tabs view? For Step 1 we just track activeSpaceId; renderer filters UI.
  })

  ipcMain.handle('browser:getState', () => ({
    tabs: viewManager.listTabs(),
    spaces: DEFAULT_SPACES.map((s) => ({
      ...s,
      tabIds: viewManager.listTabs().filter((t) => t.spaceId === s.id).map((t) => t.id)
    })),
    activeTabId: viewManager.getActiveTabId()
  }))

  ipcMain.handle('browser:extractMarkdown', async (_e, tabId: TabId): Promise<PageContext> => {
    const { url, title, markdown } = await viewManager.extractMarkdown(tabId)
    const excerpt = markdown.slice(0, 400)
    return { url, title, markdown, excerpt, metadata: {} }
  })

  // AI providers
  ipcMain.handle('ai:listProviders', (): AIProviderConfig[] => store.getProviders())

  ipcMain.handle('ai:getProvider', (_e, id: AIProviderId): AIProviderConfig | null => store.getProvider(id))

  ipcMain.handle('ai:setProvider', (_e, config: AIProviderConfig): void => {
    store.setProvider(config)
  })

  // AI chat — now wired to local 135M sidecar + cloud (Gecko aiRouter parity)
  // For local-smollm135/ollama we fetch http://localhost:11435/11434 (Ollama-compatible NDJSON)
  const SYSTEM_PROMPTS: Record<string, string> = {
    summarize: 'You are Blueberry AI, an expert web summarizer. Produce concise bullet points, preserve key facts, numbers, and links. Use markdown.',
    qa: 'You are Blueberry AI. Answer questions grounded in the provided page context. Cite snippets. If not in context, say so.',
    extract: 'You are Blueberry AI. Extract structured data as requested, return valid JSON or markdown tables.',
    general: 'You are Blueberry AI, a helpful in-browser co-pilot. Be concise, friendly, and web-aware.'
  }
  function buildSystemPrompt(task: string, ctx?: PageContext): string {
    const base = (SYSTEM_PROMPTS as Record<string, string>)[task] ?? SYSTEM_PROMPTS.general
    if (!ctx) return base
    return `${base}\n\n## Page Context\nTitle: ${ctx.title}\nURL: ${ctx.url}\n\n${ctx.markdown.slice(0, 6000)}`
  }

  async function fetchLocalChat(req: ChatRequest, cfg: AIProviderConfig): Promise<string> {
    const task = (req as unknown as { task?: string }).task ?? 'general'
    const system = buildSystemPrompt(task, req.context)
    const messages = [{ role: 'system', content: system }, ...req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))]
    const url = `${cfg.baseUrl ?? (cfg.id === 'local-smollm135' ? 'http://localhost:11435' : 'http://localhost:11434')}/api/chat`
    const body = { model: cfg.model, messages, stream: false }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`${cfg.id} ${res.status}: ${await res.text()}`)
    const j = await res.json() as { message?: { content: string }; response?: string; generated_text?: string }
    return j.message?.content ?? j.response ?? j.generated_text ?? JSON.stringify(j).slice(0, 2000)
  }

  ipcMain.handle('ai:chat', async (_e, req: ChatRequest): Promise<string> => {
    const cfg = store.getProvider(req.providerId) ?? store.getProviders()[0]!
    // Local open-source (free) — try sidecar first, fallback to mock
    if (req.providerId === 'local-smollm135' || req.providerId === 'ollama' || req.providerId.startsWith('local-')) {
      try { return await fetchLocalChat(req, cfg) } catch (e) {
        const last = req.messages[req.messages.length - 1]?.content ?? ''
        return `**Blueberry AI (${cfg.id} — sidecar not running)**\n\nStart it: \`powershell -ExecutionPolicy Bypass -File scripts/start-sidecar.ps1\`\n\nError: ${String(e).slice(0,300)}\n\nEcho: ${last.slice(0,200)}`
      }
    }
    // Cloud or missing key — return helpful mock
    if (!cfg.apiKey && cfg.id !== 'ollama' && !cfg.id.startsWith('local-')) {
      const last = req.messages[req.messages.length - 1]?.content ?? ''
      return `**[${cfg.id} — no API key]** Configure in Settings. Echo: ${last.slice(0,200)}`
    }
    // Fallback mock (cloud not yet wired in Electron main — use Firefox aiRouter for full cloud)
    const last = req.messages[req.messages.length - 1]?.content ?? ''
    const ctx = req.context ? `\n\n[Page: ${req.context.title} — ${req.context.url}]` : ''
    return `**Blueberry AI (${req.providerId})**\n\nYou said: ${last}${ctx}\n\n> Cloud providers via Firefox aiRouter; local 135M works now.`
  })

  ipcMain.handle('ai:chatStream', async (event, req: ChatRequest): Promise<void> => {
    const cfg = store.getProvider(req.providerId) ?? store.getProviders()[0]!
    const id = `chunk-${Date.now()}`
    // Try real streaming for local sidecar
    if (req.providerId === 'local-smollm135' || req.providerId === 'ollama' || req.providerId.startsWith('local-')) {
      try {
        const url = `${cfg.baseUrl ?? (cfg.id === 'local-smollm135' ? 'http://localhost:11435' : 'http://localhost:11434')}/api/chat`
        const body = { model: cfg.model, messages: req.messages.map(m => ({ role: m.role, content: m.content })), stream: true }
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
        const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read() as { done: boolean; value?: Uint8Array }
          if (done) break
          buf += decoder.decode(value!, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const j = JSON.parse(line) as { message?: { content: string }; done?: boolean }
              if (j.message?.content) event.sender.send('ai:chunk', { id, delta: j.message.content, done: false })
              if (j.done) { event.sender.send('ai:chunk', { id, delta: '', done: true }); return }
            } catch {}
          }
        }
        event.sender.send('ai:chunk', { id, delta: '', done: true })
        return
      } catch (e) {
        event.sender.send('ai:chunk', { id, delta: `Error (${cfg.id}): ${String(e).slice(0,300)}`, done: false })
        event.sender.send('ai:chunk', { id, delta: '', done: true })
        return
      }
    }
    // Fallback mock stream
    const full = `**Blueberry AI (stream — ${req.providerId})**\n\nYou said: ${req.messages[req.messages.length - 1]?.content ?? ''}\n\nStart local sidecar for real streaming: scripts/start-sidecar.ps1`
    const words = full.split(/(\s+)/)
    for (let i = 0; i < words.length; i++) {
      const chunk = words[i]!
      event.sender.send('ai:chunk', { id, delta: chunk, done: false })
      await new Promise((r) => setTimeout(r, 12))
    }
    event.sender.send('ai:chunk', { id, delta: '', done: true })
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())
}
