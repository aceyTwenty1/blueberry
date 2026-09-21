/**
 * ViewManager — manages WebContentsView pool for tabs.
 * Each Tab gets a WebContentsView; only the active view is attached to the window.
 * Handles layout bounds, navigation events, and tab metadata sync.
 */
import { BrowserWindow, WebContentsView } from 'electron'
import type { Tab, TabId, TabUpdatePayload } from '@shared/types/tab'
import { DEFAULT_URL } from '@shared/constants/defaults'
import { generateId } from '@shared/utils/helpers'

export type ViewEvents = {
  onTabsChanged: (payload: { tabs: Tab[]; activeTabId: TabId | null }) => void
  onTabUpdated: (payload: TabUpdatePayload) => void
}

export class ViewManager {
  private window: BrowserWindow | null = null
  private views = new Map<TabId, WebContentsView>()
  private tabs = new Map<TabId, Tab>()
  private activeTabId: TabId | null = null
  private events: ViewEvents | null = null
  private activeSpaceId: string = 'space-personal'
  private markdownCache = new Map<TabId, { markdown: string; title: string; url: string; at: number }>()
  private layoutTimer: NodeJS.Timeout | null = null
  private layoutPending = false

  constructor(events: ViewEvents) {
    this.events = events
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win
    // Debounced layout — 60fps, avoids thrash on drag resize (research §6.3)
    const debounced = () => this.scheduleLayout()
    win.on('resize', debounced)
    win.on('enter-html-full-screen', debounced)
    win.on('leave-html-full-screen', debounced)
  }

  private scheduleLayout(): void {
    if (this.layoutTimer) return
    if (this.layoutPending) return
    this.layoutPending = true
    // 16ms ~60fps, coalesces rapid resize events
    this.layoutTimer = setTimeout(() => {
      this.layoutTimer = null
      this.layoutPending = false
      this.layout()
    }, 16)
  }

  /** Create a new tab + backing WebContentsView */
  createTab(url: string = DEFAULT_URL, spaceId?: string): Tab {
    const id = generateId('tab')
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // preload for content extraction (optional, not privileged)
      }
    })

    const tab: Tab = {
      id,
      url,
      title: 'New Tab',
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      spaceId: spaceId ?? this.activeSpaceId,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    }

    this.views.set(id, view)
    this.tabs.set(id, tab)
    this.bindViewEvents(id, view)

    // load
    void view.webContents.loadURL(url).catch(() => {
      // fallback for invalid URLs handled via normalize in renderer; keep error title
      tab.title = 'Failed to load'
      this.emitUpdate({ id, title: tab.title, isLoading: false })
    })

    this.activateTab(id)
    this.emitChanged()
    return tab
  }

  closeTab(id: TabId): void {
    const view = this.views.get(id)
    if (view) {
      if (this.window && this.activeTabId === id) {
        this.window.contentView.removeChildView(view)
      }
      // destroy webContents (best-effort: view is already detached above)
      const wc: unknown = view.webContents
      if (wc && typeof (wc as { destroy?: () => void }).destroy === 'function') {
        try {
          ;(wc as { destroy: () => void }).destroy()
        } catch (e) {
          console.warn(`[viewManager] webContents.destroy failed for tab ${id}:`, String(e).slice(0, 160))
        }
      }
      this.views.delete(id)
    }
    this.tabs.delete(id)

    if (this.activeTabId === id) {
      const next = [...this.tabs.keys()].pop() ?? null
      if (next) this.activateTab(next)
      else {
        this.activeTabId = null
        if (this.window) this.window.contentView.removeChildView(view!)
      }
    }
    this.emitChanged()
  }

  activateTab(id: TabId): void {
    const view = this.views.get(id)
    const tab = this.tabs.get(id)
    if (!view || !tab || !this.window) return

    // detach previous
    if (this.activeTabId) {
      const prev = this.views.get(this.activeTabId)
      if (prev && this.window.contentView.children.includes(prev)) {
        this.window.contentView.removeChildView(prev)
      }
    }

    this.window.contentView.addChildView(view)
    this.activeTabId = id
    tab.lastActiveAt = Date.now()
    this.layout()
    // focus so keyboard goes to web content
    view.webContents.focus()
    this.emitChanged()
  }

  navigate(id: TabId, url: string): void {
    const view = this.views.get(id)
    const tab = this.tabs.get(id)
    if (!view || !tab) return
    tab.url = url
    tab.isLoading = true
    this.emitUpdate({ id, url, isLoading: true })
    void view.webContents.loadURL(url)
  }

  go(id: TabId, action: 'back' | 'forward' | 'reload' | 'stop'): void {
    const view = this.views.get(id)
    if (!view) return
    const wc = view.webContents
    if (action === 'back' && wc.canGoBack()) wc.goBack()
    else if (action === 'forward' && wc.canGoForward()) wc.goForward()
    else if (action === 'reload') wc.reload()
    else if (action === 'stop') wc.stop()
  }

  listTabs(): Tab[] {
    return [...this.tabs.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  getActiveTabId(): TabId | null {
    return this.activeTabId
  }

  getTab(id: TabId): Tab | undefined {
    return this.tabs.get(id)
  }

  getView(id: TabId): WebContentsView | undefined {
    return this.views.get(id)
  }

  /** Extract clean markdown-ish text via executeJavaScript — with warm cache (research §6.4) */
  async extractMarkdown(tabId: TabId): Promise<{ url: string; title: string; markdown: string }> {
    const view = this.views.get(tabId)
    const tab = this.tabs.get(tabId)
    if (!view || !tab) throw new Error('Tab not found')

    // Serve warm cache if fresh (<30s and same URL)
    const cached = this.markdownCache.get(tabId)
    const currentUrl = view.webContents.getURL()
    if (cached && Date.now() - cached.at < 30_000 && cached.url === currentUrl) {
      return { url: cached.url, title: cached.title, markdown: cached.markdown }
    }

    const result = await view.webContents.executeJavaScript(`
      (() => {
        const sel = document.querySelector('article') || document.body;
        let text = sel ? sel.innerText : document.documentElement.innerText;
        if (text.length > 8000) text = text.slice(0, 8000) + "\\n\\n[truncated]";
        return { title: document.title, url: location.href, text };
      })()
    `)

    const r = result as { title: string; url: string; text: string }
    const out = { url: r.url ?? tab.url, title: r.title ?? tab.title, markdown: r.text ?? '' }
    // Bound the cache: ~20 pages × 8KB ≈ 160KB max (matters on 16GB shared-iGPU ultrabooks)
    if (this.markdownCache.size >= 20) {
      const oldest = this.markdownCache.keys().next()
      if (!oldest.done) this.markdownCache.delete(oldest.value)
    }
    this.markdownCache.set(tabId, { ...out, at: Date.now() })
    return out
  }

  private warmExtract(tabId: TabId): void {
    const view = this.views.get(tabId)
    if (!view) return
    // Low-priority warm — requestIdleCallback in renderer, setTimeout 0 in main
    const idle = (global as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback
    const run = () => {
      void this.extractMarkdown(tabId).catch(() => {})
    }
    if (idle) idle(run, { timeout: 2000 })
    else setTimeout(run, 150)
  }

  /** Layout active WebContentsView to fill below the renderer toolbar (approx 96px header) */
  layout(): void {
    if (!this.window || !this.activeTabId) return
    const view = this.views.get(this.activeTabId)
    if (!view) return
    const bounds = this.window.getContentBounds()
    // Reserve top area for React chrome (address bar + tab bar).
    // Renderer is overlayed via BrowserWindow's contentView; we leave 84px top.
    const HEADER_HEIGHT = 84
    view.setBounds({
      x: 0,
      y: HEADER_HEIGHT,
      width: bounds.width,
      height: Math.max(0, bounds.height - HEADER_HEIGHT)
    })
  }

  private bindViewEvents(id: TabId, view: WebContentsView): void {
    const wc = view.webContents

    wc.on('did-start-loading', () => {
      const tab = this.tabs.get(id)
      if (tab) {
        tab.isLoading = true
        this.emitUpdate({ id, isLoading: true })
      }
    })

    wc.on('did-stop-loading', () => {
      const tab = this.tabs.get(id)
      if (!tab) return
      tab.isLoading = false
      tab.title = wc.getTitle() || tab.title
      tab.url = wc.getURL()
      tab.canGoBack = wc.canGoBack()
      tab.canGoForward = wc.canGoForward()
      this.emitUpdate({
        id,
        title: tab.title,
        url: tab.url,
        isLoading: false,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward
      })
      this.emitChanged()
      // Warm markdown cache via idle (so sidebar ask is instant)
      this.warmExtract(id)
    })

    wc.on('page-title-updated', (_e, title) => {
      const tab = this.tabs.get(id)
      if (tab) {
        tab.title = title
        this.emitUpdate({ id, title })
      }
    })

    wc.on('did-navigate', (_e, url) => {
      const tab = this.tabs.get(id)
      if (tab) {
        tab.url = url
        this.emitUpdate({ id, url })
        this.emitChanged()
      }
    })

    wc.on('did-navigate-in-page', (_e, url) => {
      const tab = this.tabs.get(id)
      if (tab) {
        tab.url = url
        this.emitUpdate({ id, url })
      }
    })
  }

  private emitChanged(): void {
    this.events?.onTabsChanged({ tabs: this.listTabs(), activeTabId: this.activeTabId })
  }

  private emitUpdate(payload: TabUpdatePayload): void {
    this.events?.onTabUpdated(payload)
  }
}
