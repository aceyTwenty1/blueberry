import { useEffect, useState } from 'react'
import { Search, Sparkles, FileText, Globe, Table, DollarSign, Wand2, Command, ArrowUpDown } from 'lucide-react'

type CommandItem = { id: string; label: string; desc: string; hint?: string; icon: React.ReactNode; grad: string; action: () => void }

export function CommandPalette({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (url: string) => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  if (!open) return null

  const commands: CommandItem[] = [
    { id: 'summarize', label: 'Summarize this page', desc: 'Beautiful bullets • Keep numbers', hint: 'AI', icon: <FileText className="w-4 h-4 text-white" />, grad: 'from-indigo-500 to-violet-500', action: () => onClose() },
    { id: 'extract-tables', label: 'Extract tables', desc: 'As clean markdown', hint: 'AI', icon: <Table className="w-4 h-4 text-white" />, grad: 'from-emerald-500 to-teal-500', action: () => onClose() },
    { id: 'pricing', label: 'Find pricing plans', desc: 'Tiers • Comparisons', hint: 'AI', icon: <DollarSign className="w-4 h-4 text-white" />, grad: 'from-amber-500 to-orange-500', action: () => onClose() },
    { id: 'clean', label: 'Clean view', desc: 'Reader • Strip ads', hint: 'AI', icon: <Wand2 className="w-4 h-4 text-white" />, grad: 'from-fuchsia-500 to-pink-500', action: () => onClose() },
    { id: 'newtab', label: 'New Tab', desc: 'Open fresh tab', hint: '⌘T', icon: <Globe className="w-4 h-4 text-zinc-400" />, grad: 'from-zinc-700 to-zinc-800', action: () => onClose() }
  ]

  const filtered = query ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase())) : commands
  const showNavigate = query.trim().length > 2

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={onClose} style={{ background: 'radial-gradient(800px 400px at 50% 0%, rgba(99,102,241,0.12), transparent 60%), rgba(0,0,0,0.72)' }} />
      <div className="relative w-[640px] max-w-[92vw] rounded-[20px] overflow-hidden shadow-premium border border-transparent animate-slide-in" style={{ background: 'linear-gradient(#18181b,#18181b) padding-box, linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.3), rgba(236,72,153,0.2)) border-box', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset' }}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/80 bg-gradient-to-b from-zinc-800/30 to-transparent">
          <div className="w-9 h-9 rounded-xl bg-blueberry grid place-items-center text-white shadow-blueberry border border-white/10 shrink-0">
            <Command className="w-4 h-4" />
          </div>
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask Blueberry, run commands, or go to URL…"
            className="flex-1 bg-transparent outline-none text-[14.5px] font-medium text-white placeholder:text-zinc-500"
          />
          <span className="hidden sm:inline-flex text-[11px] font-bold px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400">ESC</span>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2 bg-[#18181b]">
          {showNavigate && (
            <button
              onClick={() => { onNavigate(query.trim()); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-indigo-500/25 bg-gradient-to-r from-indigo-500/10 to-violet-500/5 hover:from-indigo-500/15 hover:to-violet-500/10 text-left mb-1 transition"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 grid place-items-center shrink-0"><Search className="w-4 h-4 text-zinc-400" /></div>
              <span className="text-sm font-semibold text-white flex-1">Go to “{query.trim()}”</span>
              <span className="text-xs font-medium px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400">↵</span>
            </button>
          )}

          <div className="px-2 py-1.5 text-[11px] font-bold tracking-widest text-zinc-500 flex items-center gap-2">
            <span className="w-4 h-px bg-zinc-700" /> AI ACTIONS <span className="ml-auto font-medium text-zinc-600 normal-case tracking-normal">{filtered.length}</span>
          </div>
          {filtered.map(c => (
            <button key={c.id} onClick={c.action} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-left group transition border border-transparent hover:border-zinc-700/50">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.grad} grid place-items-center shrink-0 shadow-md`}>{c.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-zinc-100 leading-none tracking-tight">{c.label}</div>
                <div className="text-xs text-zinc-500">{c.desc}</div>
              </div>
              {c.hint && <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400">{c.hint}</span>}
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 grid place-items-center mx-auto mb-2"><Search className="w-5 h-5 text-zinc-600" /></div>
              <p className="text-sm font-medium text-zinc-300">No results</p>
              <p className="text-xs text-zinc-500">Try “Summarize” or paste a URL</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/50 text-[11px]">
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="flex items-center gap-1.5"><ArrowUpDown className="w-3 h-3" /> navigate</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span className="flex items-center gap-1.5">↵ select</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-medium">Blueberry • Gecko</span>
          </div>
        </div>
      </div>
    </div>
  )
}
