import { X, Plus, Globe, Loader2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Tab, Space } from '@shared/types/tab'
import { extractDomain } from '@shared/utils/helpers'
import { cn } from '@/lib/utils'

export function VerticalTabs({
  tabs,
  spaces,
  activeTabId,
  activeSpaceId,
  onActivate,
  onClose,
  onCreateTab,
  onCreateSpace
}: {
  tabs: Tab[]
  spaces: Space[]
  activeTabId: string | null
  activeSpaceId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCreateTab: () => void
  onCreateSpace: () => void
}) {
  return (
    <div className="w-[280px] shrink-0 bg-[#09090b] border-r border-zinc-800/80 flex flex-col relative">
      {/* Mesh gradient */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ background: 'radial-gradient(600px 300px at 20% 0%, #6366f1, transparent 60%), radial-gradient(500px 300px at 100% 0%, #ec4899, transparent 60%)' }} />
      {/* Traffic light spacer for hiddenInset */}
      <div className="h-[28px] drag-region shrink-0 relative z-10" />

      {/* Brand */}
      <div className="px-3 py-3 flex items-center gap-2.5 relative z-10">
        <div className="w-8 h-8 rounded-xl bg-blueberry grid place-items-center text-white font-black shadow-blueberry border border-white/10 shrink-0">◐</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold tracking-tight text-white leading-none">Blueberry</div>
          <div className="text-[11px] font-medium text-zinc-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Gecko • BETA</div>
        </div>
        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 grid place-items-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition cursor-pointer">
          <Layers className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Spaces — pill nav */}
      <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-thin relative z-10">
        {spaces.map((s) => (
          <button
            key={s.id}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5',
              s.id === activeSpaceId
                ? 'bg-white text-zinc-900 border-white shadow-sm'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white hover:border-zinc-600'
            )}
          >
            <span className="text-[12px]">{s.icon}</span>
            {s.name}
          </button>
        ))}
        <button
          onClick={onCreateSpace}
          className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 grid place-items-center hover:bg-zinc-700 hover:border-zinc-600 transition group"
          title="New Space"
        >
          <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white" />
        </button>
      </div>

      <div className="mx-3 h-px bg-zinc-800/60 my-2" />

      {/* Tabs */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1.5 relative z-10">
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-widest text-zinc-500">TABS</span>
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400">{tabs.length}</span>
        </div>
        {tabs.length === 0 && (
          <div className="mx-1 p-6 rounded-2xl bg-zinc-900/50 border border-dashed border-zinc-800 text-center">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 grid place-items-center mx-auto mb-2"><Globe className="w-5 h-5 text-zinc-500" /></div>
            <p className="text-xs font-medium text-zinc-300">No tabs yet</p>
            <p className="text-[11px] text-zinc-500 mt-1">Press ⌘T or click New Tab</p>
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => onActivate(tab.id)}
            className={cn(
              'group flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl cursor-pointer border transition-all relative overflow-hidden',
              tab.id === activeTabId
                ? 'bg-zinc-800 border-zinc-700 text-white shadow-lg shadow-black/20'
                : 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100 hover:border-zinc-800'
            )}
          >
            {tab.id === activeTabId && <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-blueberry" />}
            <div className={cn('w-8 h-8 rounded-lg grid place-items-center shrink-0 border transition', tab.id === activeTabId ? 'bg-zinc-700 border-zinc-600' : 'bg-zinc-800 border-zinc-700/50 group-hover:bg-zinc-800')}>
              {tab.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              ) : tab.favicon ? (
                <img src={tab.favicon} alt="" className="w-4 h-4 rounded-sm" />
              ) : (
                <Globe className="w-4 h-4 text-zinc-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate font-semibold text-[13px] leading-tight tracking-tight">{tab.title || 'New Tab'}</div>
              <div className="truncate text-[11px] font-medium flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', tab.id === activeTabId ? 'bg-emerald-500' : 'bg-zinc-600')} />
                <span className="text-zinc-500">{extractDomain(tab.url)}</span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
              className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-zinc-700 grid place-items-center shrink-0 transition text-zinc-400 hover:text-white"
              aria-label="Close tab"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/50 backdrop-blur relative z-10">
        <Button onClick={onCreateTab} variant="primary" className="w-full rounded-xl h-9 font-bold shadow-blueberry">
          <Plus className="w-4 h-4 mr-1.5" />
          New Tab
          <span className="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-white/15 border border-white/10">⌘T</span>
        </Button>
        <div className="flex items-center justify-center gap-2 mt-2.5">
          <div className="w-1 h-1 rounded-full bg-zinc-700" />
          <p className="text-[11px] font-medium tracking-wide text-zinc-500">Blueberry • AI-Native • 0.1.0</p>
          <div className="w-1 h-1 rounded-full bg-zinc-700" />
        </div>
      </div>
    </div>
  )
}
