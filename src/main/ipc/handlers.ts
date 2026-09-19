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

  // AI chat (Step 1: echo/mock; real streaming wired in Step 4/5)
  ipcMain.handle('ai:chat', async (_e, req: ChatRequest): Promise<string> => {
    // Minimal stub: returns a formatted echo so UI can be tested without keys.
    // Real provider routing (Ollama/OpenAI/Anthropic/Gemini) lands in src/ai/providers/* in Step 4.
    const last = req.messages[req.messages.length - 1]?.content ?? ''
    const ctx = req.context ? `\n\n[Page: ${req.context.title} — ${req.context.url}]` : ''
    return `**Blueberry AI (mock — ${req.providerId})**\n\nYou said: ${last}${ctx}\n\n> Provider integration lands in Step 4. Configure keys in Settings.`
  })

  ipcMain.handle('ai:chatStream', async (event, req: ChatRequest): Promise<void> => {
    // Mock streaming: chunk the same mock response
    const full = `**Blueberry AI (stream mock — ${req.providerId})**\n\nYou said: ${req.messages[req.messages.length - 1]?.content ?? ''}\n\nStreaming support will use ReadableStream in Step 4.`
    const id = `chunk-${Date.now()}`
    const words = full.split(/(\s+)/)
    for (let i = 0; i < words.length; i++) {
      const chunk = words[i]!
      event.sender.send('ai:chunk', { id, delta: chunk, done: false })
      // small delay to simulate token streaming
      await new Promise((r) => setTimeout(r, 12))
    }
    event.sender.send('ai:chunk', { id, delta: '', done: true })
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())
}
