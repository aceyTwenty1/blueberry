/**
 * Blueberry — Firefox Background Script (Gecko MV2)
 * Replaces Electron main/index.ts + viewManager.ts + ipc/handlers.ts
 * Runs as privileged background in Gecko; manages tabs/spaces, page context, AI routing.
 * Uses WebExtension APIs: browser.tabs, browser.storage, browser.sidebarAction, browser.contextMenus
 */

import type { Tab, Space } from '../../../shared/types/tab'
import type { PageContext, AIProviderConfig } from '../../../shared/types/ai'
import { DEFAULT_SPACES, DEFAULT_AI_PROVIDERS } from '../../../shared/constants/defaults'
import { chatGecko, chatStreamGecko } from './aiRouter'
import { encryptProviders, decryptProviders } from './crypto'
import { runAgentGecko } from './agent'
import type { AgentRunRequest } from '../../../shared/types/agent'
import type { ComposioConfig } from '../../../shared/types/composio'
import {
  applyWorkspace,
  assignTab,
  createWorkspace,
  getActiveWorkspaceId,
  getTabMap,
  getTabWorkspace,
  getWorkspaces,
  unassignTab
} from './workspaces'

// Gecko WebExtension globals — types provided by @types/firefox-webext-browser (tsconfig.firefox.json)
// `browser` is global in MV2 background; no custom shim needed.

// State mirrored to storage.local (replaces Electron store utils/store.ts)
const STORAGE_KEYS = { providers: 'blueberry:providers', spaces: 'blueberry:spaces' }

async function getProviders(): Promise<AIProviderConfig[]> {
  const data = await browser.storage.local.get(STORAGE_KEYS.providers)
  const stored = data[STORAGE_KEYS.providers] as Array<Record<string, unknown>> | undefined
  if (!stored) return DEFAULT_AI_PROVIDERS
  try {
    const dec = (await decryptProviders(stored)) as unknown as AIProviderConfig[]
    return dec
  } catch {
    return stored as unknown as AIProviderConfig[]
  }
}

async function saveProvider(config: AIProviderConfig): Promise<void> {
  const providers = await getProviders()
  const idx = providers.findIndex((p) => p.id === config.id)
  if (idx >= 0) providers[idx] = config
  else providers.push(config)
  const enc = (await encryptProviders(providers as Array<{ apiKey?: string }>)) as AIProviderConfig[]
  await browser.storage.local.set({ [STORAGE_KEYS.providers]: enc })
}

// Page context extraction — delegates to content script extractor.ts
async function extractPageContext(tabId: number): Promise<PageContext | null> {
  try {
    const results = (await browser.tabs.executeScript(tabId, {
      code: `(() => {
        const sel = document.querySelector('article') || document.body;
        let text = sel ? (sel.innerText || '') : document.documentElement.innerText;
        if (text.length > 8000) text = text.slice(0,8000) + "\\n\\n[truncated]";
        return { title: document.title, url: location.href, markdown: text, excerpt: text.slice(0,400) };
      })()`
    })) as Array<{ title: string; url: string; markdown: string; excerpt: string }>
    const r = results[0]
    if (!r) return null
    return { url: r.url, title: r.title, markdown: r.markdown, excerpt: r.excerpt, metadata: {} }
  } catch (e) {
    console.warn('[Blueberry] extract failed', e)
    return null
  }
}

// Message router — replaces Electron ipcMain.handle('ai:chat', etc.)
browser.runtime.onMessage.addListener(async (msg: unknown, sender: unknown) => {
  const m = msg as { type: string; payload?: unknown }
  switch (m.type) {
    case 'BLUEBERRY_GET_PROVIDERS':
      return getProviders()
    case 'BLUEBERRY_SET_PROVIDER':
      await saveProvider(m.payload as AIProviderConfig)
      return { ok: true }
    case 'BLUEBERRY_GET_COMPOSIO': {
      const { getComposioConfig } = await import('./agent')
      return getComposioConfig()
    }
    case 'BLUEBERRY_SET_COMPOSIO': {
      const { saveComposioConfig } = await import('./agent')
      await saveComposioConfig(m.payload as ComposioConfig)
      return { ok: true }
    }
    case 'BLUEBERRY_COMPOSIO_TEST': {
      const { getComposioConfig } = await import('./agent')
      const { composioListTools } = await import('../../../ai/agent/composio')
      try {
        const cfg = await getComposioConfig()
        if (!cfg.consumerKey) return { ok: false, message: 'No consumer key set.' }
        const tools = await composioListTools({ ...cfg, enabled: true })
        return { ok: true, message: `Connected — ${tools.length} meta tools available.` }
      } catch (e) {
        return { ok: false, message: String(e).slice(0, 300) }
      }
    }
    case 'BLUEBERRY_EXTRACT': {
      const { tabId } = m.payload as { tabId: number }
      return extractPageContext(tabId)
    }
    case 'BLUEBERRY_CHAT': {
      const { providerId, messages, context, task } = m.payload as {
        providerId: string
        messages: Array<{ role: string; content: string }>
        context?: PageContext
        task?: string
      }
      const providers = await getProviders()
      const cfg = providers.find((p) => p.id === providerId) ?? providers[0]!
      // If no key and not local, return mock with helpful hint
      if (!cfg.apiKey && cfg.id !== 'ollama' && !cfg.id.startsWith('local-')) {
        const last = messages[messages.length - 1]?.content ?? ''
        return { text: `[${cfg.id} — no API key set] Configure in Blueberry Settings. Echo: ${last.slice(0, 120)}` }
      }
      try {
        const text = await chatGecko(
          {
            messages: messages.map((msg) => ({ id: 'm', role: msg.role as 'user' | 'assistant', content: msg.content, timestamp: Date.now() })),
            providerId: providerId as never,
            context: context as never,
            task: task as never
          } as unknown as never,
          cfg
        )
        return { text }
      } catch (e) {
        return { text: `Error (${cfg.id}): ${String(e).slice(0, 600)}` }
      }
    }
    case 'BLUEBERRY_CHAT_STREAM': {
      const { providerId, messages, context, task } = m.payload as {
        providerId: string
        messages: Array<{ role: string; content: string }>
        context?: PageContext
        task?: string
      }
      const providers = await getProviders()
      const cfg = providers.find((p) => p.id === providerId) ?? providers[0]!
      ;(async () => {
        try {
          for await (const delta of chatStreamGecko(
            {
              messages: messages.map((msg) => ({ id: 'm', role: msg.role as 'user' | 'assistant', content: msg.content, timestamp: Date.now() })),
              providerId: providerId as never,
              context: context as never,
              task: task as never,
              stream: true
            } as unknown as never,
            cfg
          )) {
            await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHUNK', payload: { delta, done: false } }).catch(() => {})
          }
        } catch (e) {
          await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHUNK', payload: { delta: `Error: ${String(e).slice(0, 400)}`, done: false } }).catch(() => {})
        } finally {
          await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHUNK', payload: { delta: '', done: true } }).catch(() => {})
        }
      })()
      return { ok: true, streaming: true }
    }
    case 'BLUEBERRY_AGENT_RUN': {
      const req = m.payload as AgentRunRequest
      ;(async () => {
        try {
          await runAgentGecko(
            req,
            async () => {
              const providers = await getProviders()
              return providers.find((p) => p.id === req.providerId) ?? providers[0]!
            },
            async (e) => {
              await browser.runtime.sendMessage({ type: 'BLUEBERRY_AGENT_EVENT', payload: e }).catch(() => {})
            }
          )
        } catch (e) {
          await browser.runtime
            .sendMessage({ type: 'BLUEBERRY_AGENT_EVENT', payload: { type: 'error', message: String(e).slice(0, 300) } })
            .catch(() => {})
        }
      })()
      return { ok: true, streaming: true }
    }
    case 'BLUEBERRY_GET_WORKSPACES': {
      const [spaces, activeId, tabMap] = await Promise.all([getWorkspaces(), getActiveWorkspaceId(), getTabMap()])
      const tabs = await browser.tabs.query({ currentWindow: true })
      const openIds = new Set(tabs.filter((t) => t.id !== undefined).map((t) => String(t.id)))
      const withTabs = spaces.map((s) => {
        // Only open tabs; unmapped open tabs belong to the active workspace
        const ids = Object.entries(tabMap)
          .filter(([tabId, ws]) => ws === s.id && openIds.has(tabId))
          .map(([tabId]) => tabId)
        if (s.id === activeId) {
          for (const t of tabs) {
            const key = String(t.id)
            if (t.id !== undefined && !(key in tabMap) && !ids.includes(key)) ids.push(key)
          }
        }
        return { ...s, tabIds: ids }
      })
      return { spaces: withTabs, activeId }
    }
    case 'BLUEBERRY_SET_WORKSPACE': {
      const { id } = m.payload as { id: string }
      const res = await applyWorkspace(id)
      await browser.runtime.sendMessage({ type: 'BLUEBERRY_WORKSPACES_CHANGED', payload: { activeId: id } }).catch(() => {})
      return res
    }
    case 'BLUEBERRY_CREATE_WORKSPACE': {
      const { name } = m.payload as { name: string }
      const ws = await createWorkspace(name)
      await browser.runtime.sendMessage({ type: 'BLUEBERRY_WORKSPACES_CHANGED', payload: { activeId: ws.id } }).catch(() => {})
      return ws
    }
    case 'BLUEBERRY_ASSIGN_TAB': {
      const { tabId, workspaceId } = m.payload as { tabId: number; workspaceId: string }
      await assignTab(tabId, workspaceId)
      return { ok: true }
    }
    case 'BLUEBERRY_TABS_LIST': {
      const tabs = await browser.tabs.query({})
      return tabs.map(
        (t): Tab => ({
          id: String(t.id),
          url: t.url ?? '',
          title: t.title ?? 'New Tab',
          favicon: t.favIconUrl,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          spaceId: 'space-personal',
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        })
      )
    }
    default:
      return null
  }
})

// Context menus for quick AI actions (replaces Electron menu.ts)
browser.contextMenus.create({
  id: 'blueberry-summarize',
  title: 'Blueberry: Summarize page',
  contexts: ['page']
})
browser.contextMenus.create({
  id: 'blueberry-extract-tables',
  title: 'Blueberry: Extract tables',
  contexts: ['page']
})
browser.contextMenus.create({
  id: 'blueberry-qa',
  title: 'Blueberry: Ask about this page',
  contexts: ['page']
})

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = (info as { menuItemId: string }).menuItemId
  if (!tab?.id) return
  const ctx = await extractPageContext(tab.id)
  // Forward to sidebar via runtime message
  await browser.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action: id, context: ctx, tabId: tab.id } }).catch(() => {})
})

// Commands (Cmd+K palette) — browser.commands replaces Electron globalShortcut
browser.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'blueberry-command-palette') {
    // Inject palette UI via content script
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (tab?.id) {
      await browser.tabs.executeScript(tab.id, { file: 'content/palette.js' }).catch(() => {})
    }
  }
  if (cmd === 'blueberry-vertical-tabs') {
    // Toggle vertical tabs via browser.tabs.hide / sidebar — requires `tabs` + `tabHide` permission
    // For now just open sidebar
    await (browser.sidebarAction as unknown as { open: () => Promise<void> }).open().catch(() => {})
  }
})

// Notify sidebar on tab changes (replaces ViewManager onTabsChanged)
browser.tabs.onUpdated.addListener((_id, _info, tab) => {
  browser.runtime.sendMessage({ type: 'BLUEBERRY_TAB_UPDATED', payload: { tab } }).catch(() => {})
})
browser.tabs.onActivated.addListener((info) => {
  browser.runtime.sendMessage({ type: 'BLUEBERRY_TAB_ACTIVATED', payload: { tabId: info.tabId } }).catch(() => {})
})

// Workspace tab bookkeeping: new tabs join the active workspace, closed tabs are forgotten
browser.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined) return
  try {
    const activeId = await getActiveWorkspaceId()
    if (!(await getTabWorkspace(tab.id, ''))) await assignTab(tab.id, activeId)
    await browser.runtime.sendMessage({ type: 'BLUEBERRY_WORKSPACES_CHANGED', payload: { activeId } }).catch(() => {})
  } catch {
    // non-fatal
  }
})
browser.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await unassignTab(tabId)
    const activeId = await getActiveWorkspaceId()
    await browser.runtime.sendMessage({ type: 'BLUEBERRY_WORKSPACES_CHANGED', payload: { activeId } }).catch(() => {})
  } catch {
    // non-fatal
  }
})

console.log('[Blueberry] Gecko background ready — providers:', DEFAULT_SPACES.map((s) => s.name).join(', '))
