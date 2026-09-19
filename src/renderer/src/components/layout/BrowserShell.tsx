import { useState, useEffect } from 'react'
import { VerticalTabs } from '@/components/browser/VerticalTabs'
import { AddressBar } from '@/components/browser/AddressBar'
import { AISidebar } from '@/components/browser/AISidebar'
import { CommandPalette } from '@/components/browser/CommandPalette'
import { useTabs } from '@/hooks/useTabs'
import { useCommandPalette } from '@/hooks/useCommandPalette'
import type { Space } from '@shared/types/tab'
import { DEFAULT_SPACES } from '@shared/constants/defaults'

export function BrowserShell() {
  const { tabs, activeTab, activeTabId, createTab, closeTab, activateTab, navigate, go } = useTabs()
  const { open, setOpen } = useCommandPalette()
  const [spaces] = useState<Space[]>(
    DEFAULT_SPACES.map((s) => ({ ...s, tabIds: [] })) as Space[]
  )
  const [activeSpaceId] = useState<string>(spaces[0]?.id ?? 'space-personal')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Derive space tabs for current logic (Step 1: show all)
  const visibleTabs = tabs

  // Global shortcuts: Cmd/Ctrl+T
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault()
        void createTab('https://www.google.com')
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        if (activeTabId) {
          e.preventDefault()
          void closeTab(activeTabId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createTab, closeTab, activeTabId])

  const handleExtract = async () => {
    if (!activeTabId) return null
    try {
      const ctx = await window.api.browser.extractMarkdown(activeTabId)
      return ctx
    } catch {
      return null
    }
  }

  return (
    <div className="h-screen w-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
      <VerticalTabs
        tabs={visibleTabs}
        spaces={spaces}
        activeTabId={activeTabId}
        activeSpaceId={activeSpaceId}
        onActivate={(id) => void activateTab(id)}
        onClose={(id) => void closeTab(id)}
        onCreateTab={() => void createTab('https://www.google.com')}
        onCreateSpace={() => {}}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Draggable titlebar area */}
        <div className="h-[28px] drag-region bg-zinc-900 border-b border-zinc-800 shrink-0 hidden" />

        <AddressBar
          tab={activeTab}
          onNavigate={(url) => {
            if (activeTabId) void navigate(activeTabId, url)
            else void createTab(url)
          }}
          onAction={(action) => {
            if (activeTabId) void go(activeTabId, action)
          }}
        />

        {/* WebContentsView placeholder — actual web content is rendered natively below the 84px header */}
        <div className="flex-1 bg-[#09090b] relative flex flex-col overflow-hidden">
          {/* mesh */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ background: 'radial-gradient(800px 400px at 30% 0%, #6366f1, transparent 60%), radial-gradient(600px 300px at 90% 20%, #ec4899, transparent 60%)' }} />
          {tabs.length === 0 ? (
            <div className="flex-1 grid place-items-center p-8 relative">
              <div className="text-center max-w-lg w-full">
                <div className="w-16 h-16 rounded-2xl bg-blueberry grid place-items-center mx-auto mb-5 shadow-blueberry border border-white/10">
                  <span className="text-2xl">◐</span>
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white mb-2">Welcome to <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Blueberry</span></h1>
                <p className="text-[13px] font-medium text-zinc-400 mb-6 leading-relaxed">AI-native browser on Gecko. Your WebContentsView renders natively below the toolbar. Vertical tabs, AI co-pilot, and command palette — insanely fast.</p>
                <div className="grid grid-cols-3 gap-2 mb-6 text-left">
                  {[
                    { k: '⌘K', t: 'Command Palette', d: 'Summarize • Extract • Search' },
                    { k: '⌘T', t: 'Vertical Tabs', d: 'Spaces • Groups • Auto-name' },
                    { k: '⌘⇧E', t: 'AI Sidebar', d: 'Ask about any page' },
                  ].map(f => (
                    <div key={f.t} className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <div className="text-[11px] font-bold px-1.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 inline-block mb-2">{f.k}</div>
                      <div className="text-xs font-bold text-white">{f.t}</div>
                      <div className="text-[11px] text-zinc-500">{f.d}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => void createTab('https://www.google.com')}
                  className="px-6 py-3 rounded-xl bg-blueberry text-white text-sm font-bold shadow-blueberry hover:opacity-95 transition border border-white/10"
                >
                  New Tab — Google
                </button>
                <p className="text-[11px] font-medium text-zinc-600 mt-3">Tip: Press ⌘K for commands • ⌘T for new tab • ⌘⇧E for sidebar</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 grid place-items-center p-2">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold tracking-widest text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  GECKO • NATIVE RENDERING BELOW TOOLBAR
                </div>
                <p className="text-xs text-zinc-600 mt-3">WebContentsView is active — web content is rendered natively by Gecko/Chrome.</p>
              </div>
            </div>
          )}

          {/* Status bar — glass */}
          <div className="h-7 px-3 flex items-center justify-between bg-zinc-900/80 backdrop-blur border-t border-zinc-800/80 text-[11px] font-medium text-zinc-500">
            <span className="truncate pr-4">{activeTab ? `${activeTab.title} — ${activeTab.url}` : 'No tab selected • Press ⌘T'}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {tabs.length} tab{tabs.length !== 1 ? 's' : ''} • Gecko
            </span>
          </div>
        </div>
      </div>

      <AISidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activeTabUrl={activeTab?.url ?? null}
        onExtract={handleExtract}
      />

      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        onNavigate={(url) => {
          if (activeTabId) void navigate(activeTabId, url)
          else void createTab(url)
        }}
      />
    </div>
  )
}
