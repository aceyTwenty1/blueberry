import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, FileText, Table, DollarSign, Wand2, Loader2, Settings, ChevronRight, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { PageContext } from '@shared/types/ai'

export function AISidebar({
  collapsed,
  onToggle,
  activeTabUrl,
  onExtract
}: {
  collapsed: boolean
  onToggle: () => void
  activeTabUrl: string | null
  onExtract: () => Promise<PageContext | null>
}) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Hey — I’m **Blueberry** on Gecko. Ask me anything about this tab, or press **⌘K** for instant actions. Try “Summarize” below.' }
  ])
  const [streaming, setStreaming] = useState(false)
  const [providerLabel, setProviderLabel] = useState('ollama')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const handleQuickAction = async (prompt: string) => {
    await handleSend(prompt, true)
  }

  const handleSend = async (textOverride?: string, isQuick = false) => {
    const text = (textOverride ?? input).trim()
    if (!text) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setStreaming(true)
    // push empty assistant bubble for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      let ctx: PageContext | undefined
      if (!isQuick) {
        const extracted = await onExtract()
        if (extracted) ctx = extracted
      }

      const off = window.api.on('ai:chunk', (chunk: { id: string; delta: string; done: boolean }) => {
        if (chunk.done) {
          setStreaming(false)
          off()
          return
        }
        setMessages(prev => {
          const last = prev[prev.length - 1]!
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk.delta }]
        })
      })

      await window.api.ai.chatStream({
        messages: [...messages, { id: 'u', role: 'user', content: text, timestamp: Date.now(), context: ctx }],
        providerId: providerLabel as never,
        stream: true,
        context: ctx
      } as never)
    } catch (e) {
      setMessages(m => {
        const withoutLast = m.slice(0, -1)
        return [...withoutLast, { role: 'assistant', content: `⚠️ Error: ${String(e).slice(0,400)}` }]
      })
      setStreaming(false)
    }
  }

  if (collapsed) {
    return (
      <div className="w-12 shrink-0 bg-[#09090b] border-l border-zinc-800 flex flex-col items-center py-3 gap-3">
        <button onClick={onToggle} className="w-9 h-9 rounded-xl bg-blueberry grid place-items-center shadow-blueberry border border-white/10 hover:scale-105 transition">
          <Sparkles className="w-4 h-4 text-white" />
        </button>
        <div className="w-7 h-px bg-zinc-800 my-1" />
        <button onClick={onToggle} className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 grid place-items-center hover:bg-zinc-800 hover:border-zinc-700 transition">
          <ChevronRight className="w-4 h-4 text-zinc-400 rotate-180" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-[380px] shrink-0 bg-[#09090b] border-l border-zinc-800/80 flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(600px 300px at 50% 0%, #6366f1, transparent 60%)' }} />
      {/* Header */}
      <div className="h-[56px] px-3.5 flex items-center justify-between bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 shrink-0 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blueberry grid place-items-center shadow-blueberry border border-white/10">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <div className="text-[13px] font-extrabold tracking-tight text-white flex items-center gap-1.5">
              Blueberry <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 tracking-widest">BETA</span>
            </div>
            <div className="text-[11px] font-medium text-zinc-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Gecko • Live</div>
          </div>
          <span className="hidden sm:inline-flex text-[11px] font-semibold px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 ml-1">{providerLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Settings" className="rounded-xl">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse" className="rounded-xl">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Quick actions — premium 2x2 */}
      <div className="px-3.5 py-3 grid grid-cols-2 gap-2.5 border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/40 to-transparent relative z-10">
        {[
          { icon: FileText, label: 'Summarize', desc: 'Bullet points', color: 'from-indigo-500 to-violet-500', prompt: 'Summarize this page in concise bullet points.' },
          { icon: Table, label: 'Extract tables', desc: 'As markdown', color: 'from-emerald-500 to-teal-500', prompt: 'Extract all tables on this page as markdown.' },
          { icon: DollarSign, label: 'Pricing', desc: 'Find plans', color: 'from-amber-500 to-orange-500', prompt: 'Find and summarize pricing plans on this page.' },
          { icon: Wand2, label: 'Clean view', desc: 'Reader mode', color: 'from-fuchsia-500 to-pink-500', prompt: 'Clean this page — remove ads and render as markdown.' },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => handleQuickAction(card.prompt)}
            className="group text-left p-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 transition-all hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden"
          >
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${card.color} grid place-items-center text-white shadow-md`}>
              <card.icon className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-bold text-zinc-100 mt-2.5 tracking-tight">{card.label}</div>
            <div className="text-[11px] font-medium text-zinc-500">{card.desc}</div>
            <span className="absolute top-2.5 right-2.5 text-zinc-600 group-hover:text-zinc-400 transition">↗</span>
          </button>
        ))}
      </div>

      {/* Context */}
      <div className="px-3.5 py-3 border-b border-zinc-800/60 flex items-center gap-2.5 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 grid place-items-center shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold tracking-widest text-zinc-500">CONTEXT</div>
          <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            {activeTabUrl ? new URL(activeTabUrl).hostname.replace(/^www\./, '') : 'No active tab'}
          </div>
        </div>
        <button onClick={() => { if (activeTabUrl) navigator.clipboard.writeText(activeTabUrl) }} className="px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition">
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4 relative z-10" style={{ background: 'radial-gradient(600px 300px at 50% -50px, rgba(99,102,241,0.07), transparent 70%)' }}>
        {messages.map((m, i) => {
          const isUser = m.role === 'user'
          const isStreamingEmpty = streaming && i === messages.length - 1 && m.role === 'assistant' && !m.content
          if (isStreamingEmpty) {
            return (
              <div key={i} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blueberry grid place-items-center text-white font-black text-[11px] shrink-0">✦</div>
                <div className="px-3 py-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center gap-1">
                  <span className="dot w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span className="dot w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span className="dot w-1.5 h-1.5 rounded-full bg-zinc-500" />
                </div>
              </div>
            )
          }
          if (!m.content) return null
          return (
            <div key={i} className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && <div className="w-7 h-7 rounded-full bg-blueberry grid place-items-center text-white font-black text-[11px] shrink-0 mt-0.5">✦</div>}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.55] whitespace-pre-wrap break-words ${
                  isUser
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white border border-white/10 shadow-lg shadow-indigo-500/20 rounded-br-md'
                    : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-md'
                }`}
              >
                {m.content}
              </div>
              {isUser && <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 grid place-items-center text-zinc-400 font-bold text-[11px] shrink-0 mt-0.5">You</div>}
            </div>
          )
        })}
        {streaming && messages[messages.length - 1]?.content && (
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 pl-9">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Generating…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl relative z-10">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSend()
          }}
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/15 focus-within:shadow-lg transition"
        >
          <span className="text-zinc-600">✦</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this page…  (⌘K)"
            className="flex-1 bg-transparent outline-none text-[13px] font-medium text-white placeholder:text-zinc-500"
          />
          <Button type="submit" variant="primary" size="icon" className="rounded-xl w-8 h-8 shrink-0 shadow-blueberry" disabled={!input.trim() || streaming}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-[11px] font-medium text-zinc-600 mt-2 text-center flex items-center justify-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-zinc-700" /> AI can make mistakes — verify important info.
        </p>
      </div>
    </div>
  )
}
