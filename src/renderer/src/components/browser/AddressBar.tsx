import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, ShieldCheck, Search, Sparkles, Command } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Tab } from '@shared/types/tab'

export function AddressBar({
  tab,
  onNavigate,
  onAction
}: {
  tab: Tab | null
  onNavigate: (url: string) => void
  onAction: (action: 'back' | 'forward' | 'reload' | 'stop') => void
}) {
  const [value, setValue] = useState(tab?.url ?? '')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    setValue(tab?.url ?? '')
  }, [tab?.url])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) onNavigate(value.trim())
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-[#09090b] border-b border-zinc-800/80 no-drag backdrop-blur">
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onAction('back')}
          disabled={!tab?.canGoBack}
          aria-label="Back"
          className="rounded-xl hover:bg-zinc-800 disabled:opacity-30"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onAction('forward')}
          disabled={!tab?.canGoForward}
          aria-label="Forward"
          className="rounded-xl hover:bg-zinc-800 disabled:opacity-30"
        >
          <ArrowRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onAction('reload')} aria-label="Reload" className="rounded-xl hover:bg-zinc-800">
          <RotateCw className={`w-4 h-4 ${tab?.isLoading ? 'animate-spin text-indigo-400' : ''}`} />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
        <div
          className={`flex-1 flex items-center gap-2.5 rounded-full px-3.5 py-2 border transition-all ${
            focused
              ? 'bg-zinc-800 border-indigo-500/50 ring-2 ring-indigo-500/20 shadow-lg'
              : 'bg-zinc-900 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800'
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/20 grid place-items-center shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search or enter URL — press ⌘K for AI commands"
            className="flex-1 bg-transparent outline-none text-[13.5px] font-medium text-zinc-100 placeholder:text-zinc-500"
          />
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <span className="text-[11px] font-semibold px-1.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center gap-1">
              <Command className="w-3 h-3" />K
            </span>
          </div>
          <Search className="w-4 h-4 text-zinc-500 shrink-0 hidden sm:block" />
        </div>
        <Button type="submit" variant="primary" size="sm" className="rounded-full h-9 px-4 font-bold shadow-blueberry">
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Go
        </Button>
      </form>

      <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Gecko
      </div>
    </div>
  )
}
