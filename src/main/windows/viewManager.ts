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

  constructor(events: ViewEvents) {
    this.events = events
  }

  attachWindow(win: BrowserWindow): void {
    this.window = win
    // Re-layout on resize
    win.on('resize', () => this.layout())
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
      // destroy webContents
      const wc: unknown = view.webContents
      if (wc && typeof (wc as { destroy?: () => void }).destroy === 'function') {
        try { (wc as { destroy: () => void }).destroy() } catch {}
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

  /** Extract clean markdown-ish text via executeJavaScript */
  async extractMarkdown(tabId: TabId): Promise<{ url: string; title: string; markdown: string }> {
    const view = this.views.get(tabId)
    const tab = this.tabs.get(tabId)
    if (!view || !tab) throw new Error('Tab not found')

    // Lightweight extraction — Step 3 will replace with full extractor.ts
    const result = await view.webContents.executeJavaScript(`
      (() => {
        const sel = document.querySelector('article') || document.body;
        let text = sel ? sel.innerText : document.documentElement.innerText;
        // cap to ~8000 chars to stay token-efficient
        if (text.length > 8000) text = text.slice(0, 8000) + "\\n\\n[truncated]";
        return {
          title: document.title,
          url: location.href,
          text
        };
      })()
    `)

    const r = result as { title: string; url: string; text: string }
    return { url: r.url ?? tab.url, title: r.title ?? tab.title, markdown: r.text ?? '' }
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
      // favicon could be fetched via page-favicon logic later
      this.emitUpdate({
        id,
        title: tab.title,
        url: tab.url,
        isLoading: false,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward
      })
      this.emitChanged()
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
