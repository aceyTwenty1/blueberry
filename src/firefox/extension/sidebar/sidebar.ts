/**
 * Blueberry Sidebar — Premium Dark Simple (Strawberry menu, Arc polish)
 * One menu to pick agent, one pill to talk. Dark glass, gradients, motion.
 */

import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

type Agent = { id: string; name: string; desc: string; icon: string; grad: string; prompt: string; task: 'general' | 'summarize' | 'extract' | 'qa' }
const AGENTS: Agent[] = [
  { id: 'general', name: 'Blueberry', desc: 'Ask anything', icon: '◐', grad: 'from-indigo-500 to-violet-500', prompt: '', task: 'general' },
  { id: 'summarize', name: 'Summarizer', desc: '5 bullets', icon: '◐', grad: 'from-indigo-500 to-violet-500', prompt: 'Summarize the page in 5 concise bullet points. Keep key numbers, names, and links. Use markdown bullets.', task: 'summarize' },
  { id: 'extract', name: 'Extractor', desc: 'Tables → markdown', icon: '▦', grad: 'from-emerald-500 to-teal-500', prompt: 'Extract all tables on the page as clean markdown tables with headers. If no tables, say so.', task: 'extract' },
  { id: 'pricing', name: 'Pricing', desc: 'Find plans', icon: '◈', grad: 'from-amber-500 to-orange-500', prompt: 'Find and summarize pricing plans, tiers, features, and comparisons. Use a markdown table if helpful.', task: 'extract' },
  { id: 'clean', name: 'Reader', desc: 'Clean view', icon: '✦', grad: 'from-fuchsia-500 to-pink-500', prompt: 'Rewrite the page as clean reader-mode markdown. Strip ads/nav, keep headings, lists, and code.', task: 'summarize' },
]

function SidebarApp() {
  const [input, setInput] = useState('')
  const [agentId, setAgentId] = useState('general')
  const [menuOpen, setMenuOpen] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Hey — I’m Blueberry. Pick an agent from **Menu** and ask about this page. I auto-attach the current tab.' }
  ])
  const [contextUrl, setContextUrl] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const agent = AGENTS.find(a => a.id === agentId)!

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming])
  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(t => setContextUrl(t[0]?.url ?? '')).catch(() => {})
    const l = (msg: unknown) => {
      const m = msg as { type?: string; payload?: unknown }
      if (m.type === 'BLUEBERRY_TAB_ACTIVATED' || m.type === 'BLUEBERRY_TAB_UPDATED') {
        browser.tabs.query({ active: true, currentWindow: true }).then(t => setContextUrl(t[0]?.url ?? ''))
      }
      if (m.type === 'BLUEBERRY_CHUNK') {
        const { delta, done } = m.payload as { delta: string; done: boolean }
        if (done) { setStreaming(false); return }
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
          return [...prev, { role: 'assistant', content: delta }]
        })
      }
    }
    browser.runtime.onMessage.addListener(l as never)
    return () => { try { (browser.runtime.onMessage as unknown as { removeListener: (cb: unknown) => void }).removeListener(l as never) } catch {} }
  }, [])

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text) return
    setInput('')
    const fullPrompt = agentId === 'general' ? text : `${agent.prompt}\n\nUser: ${text}`
    setMessages(m => [...m, { role: 'user', content: text }])
    setStreaming(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    setMenuOpen(false)
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      const tabId = tabs[0]?.id
      let ctx: unknown = undefined
      if (tabId) ctx = await browser.runtime.sendMessage({ type: 'BLUEBERRY_EXTRACT', payload: { tabId } }).catch(() => null)
      const prov = (await browser.runtime.sendMessage({ type: 'BLUEBERRY_GET_PROVIDERS' }).catch(() => null) as Array<{ id: string }> | null)?.[0]?.id ?? 'local-smollm135'
      let gotChunk = false
      const chunkL = (msg: unknown) => {
        const mm = msg as { type?: string; payload?: { done?: boolean } }
        if (mm.type === 'BLUEBERRY_CHUNK' && !mm.payload?.done) gotChunk = true
      }
      browser.runtime.onMessage.addListener(chunkL as never)
      await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHAT_STREAM', payload: { providerId: prov, messages: [{ role: 'user', content: fullPrompt }], context: ctx, task: agent.task } }).catch(async () => {
        const r = await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHAT', payload: { providerId: prov, messages: [{ role: 'user', content: fullPrompt }], context: ctx, task: agent.task } }) as { text?: string } | null
        setMessages(prev => {
          const withoutLast = prev.slice(0, -1)
          return [...withoutLast, { role: 'assistant', content: r?.text ?? 'No response' }]
        })
        setStreaming(false)
      })
      setTimeout(() => {
        try { (browser.runtime.onMessage as unknown as { removeListener: (cb: unknown) => void }).removeListener(chunkL as never) } catch {}
        if (!gotChunk) setStreaming(false)
      }, 4000)
    } catch (e) {
      setMessages(m => {
        const withoutLast = m.slice(0, -1)
        return [...withoutLast, { role: 'assistant', content: `Error: ${String(e).slice(0,300)}` }]
      })
      setStreaming(false)
    }
  }

  return createElement('div', { style: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, system-ui, sans-serif' } },
    // Header — dark glass
    createElement('div', { style: { height: 56, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(39,39,42,0.8)', background: 'rgba(9,9,11,0.9)', backdropFilter: 'blur(16px)', position: 'relative' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        createElement('div', { style: { width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, boxShadow: '0 4px 12px rgba(99,102,241,0.35)', border: '1px solid rgba(255,255,255,0.12)' } }, '◐'),
        createElement('div', { style: { lineHeight: 1 } },
          createElement('div', { style: { fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 } }, 'Blueberry', createElement('span', { style: { fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc' } }, 'BETA')),
          createElement('div', { style: { fontSize: 11, color: '#71717a', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 } }, createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#10b981', boxShadow: '0 0 0 4px rgba(16,185,129,0.15)' } }), agent.name)
        )
      ),
      createElement('button', { onClick: () => setMenuOpen(v => !v), style: { padding: '7px 12px', borderRadius: 10, border: '1px solid #27272a', background: menuOpen ? '#fff' : '#18181b', color: menuOpen ? '#09090b' : '#fafafa', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, menuOpen ? 'Close' : 'Menu')
    ),
    // Menu
    menuOpen ? createElement('div', { style: { borderBottom: '1px solid #27272a', background: '#18181b', padding: 8 } },
      createElement('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: '#71717a', padding: '4px 8px' } }, 'TALK TO AN AGENT'),
      ...AGENTS.map(a => createElement('button', {
        key: a.id, onClick: () => { setAgentId(a.id); setMenuOpen(false); setTimeout(() => inputRef.current?.focus(), 50) },
        style: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 12, border: agentId === a.id ? '1px solid #6366f1' : '1px solid transparent', background: agentId === a.id ? 'rgba(99,102,241,0.1)' : 'transparent', cursor: 'pointer', textAlign: 'left' as const }
      },
        createElement('span', { style: { width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${a.grad.includes('indigo') ? '#6366f1, #8b5cf6' : a.grad.includes('emerald') ? '#10b981, #06b6d4' : a.grad.includes('amber') ? '#f59e0b, #f97316' : '#ec4899, #8b5cf6'})`, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, boxShadow: '0 3px 8px rgba(0,0,0,0.2)' } }, a.icon),
        createElement('span', { style: { flex: 1 } },
          createElement('div', { style: { fontSize: 13, fontWeight: 700, color: '#fafafa', lineHeight: 1 } }, a.name),
          createElement('div', { style: { fontSize: 11, color: '#71717a' } }, a.desc)
        ),
        agentId === a.id ? createElement('span', { style: { color: '#6366f1', fontSize: 12 } }, '✓') : null
      )),
      createElement('div', { style: { fontSize: 11, color: '#52525b', padding: '6px 8px', textAlign: 'center' as const } }, 'Pick an agent, then ask below. Current tab is auto-attached.')
    ) : null,
    // Context
    createElement('div', { style: { padding: '8px 12px', borderBottom: '1px solid #27272a', background: 'rgba(9,9,11,0.6)', display: 'flex', alignItems: 'center', gap: 8 } },
      createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#10b981' } }),
      createElement('span', { style: { fontSize: 11, color: '#71717a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } }, contextUrl ? new URL(contextUrl).hostname.replace(/^www\./,'') : 'No tab'),
      createElement('button', { onClick: () => setMenuOpen(true), style: { fontSize: 11, fontWeight: 700, color: '#a5b4fc', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', padding: '4px 8px', borderRadius: 999, cursor: 'pointer' } }, agent.name + ' ▾')
    ),
    // Messages
    createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'radial-gradient(600px 300px at 50% -40px, rgba(99,102,241,0.08), transparent 70%)' } },
      ...messages.map((m, i) => {
        if (!m.content && m.role === 'assistant' && streaming && i === messages.length-1) {
          return createElement('div', { key:i, style: { display:'flex', gap:8 } },
            createElement('span', { style: { width:24, height:24, borderRadius:999, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'grid', placeItems:'center', color:'#fff', fontSize:10 } }, '✦'),
            createElement('span', { style: { fontSize:12, color:'#71717a', padding:8, background:'#18181b', border:'1px solid #27272a', borderRadius:12 } }, 'Thinking...')
          )
        }
        if (!m.content) return null
        const isUser = m.role === 'user'
        return createElement('div', { key:i, style: { display:'flex', justifyContent: isUser ? 'flex-end' as const : 'flex-start' as const } },
          createElement('div', { style: { maxWidth:'85%', padding:'9px 12px', borderRadius:16, fontSize:13, lineHeight:1.5, whiteSpace:'pre-wrap' as const, background: isUser ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : '#18181b', color: isUser ? '#fff' : '#e4e4e7', border: isUser ? '1px solid rgba(255,255,255,0.1)' : '1px solid #27272a', borderBottomRightRadius: isUser ? 4 : 16, borderBottomLeftRadius: isUser ? 16 : 4 } }, m.content)
        )
      }),
      createElement('div', { ref: bottomRef })
    ),
    // Input
    createElement('div', { style: { padding:10, borderTop:'1px solid #27272a', background:'rgba(9,9,11,0.9)', backdropFilter:'blur(16px)' } },
      createElement('div', { style: { display:'flex', gap:8, alignItems:'center', padding:'6px 6px 6px 10px', borderRadius:999, border:'1px solid #27272a', background:'#18181b' } },
        createElement('button', { onClick: () => setMenuOpen(v=>!v), title:'Choose agent', style: { width:28, height:28, borderRadius:999, background:'#27272a', color:'#a1a1aa', border:'1px solid #3f3f46', display:'grid', placeItems:'center', cursor:'pointer', fontSize:12 } }, '≡'),
        createElement('input', { ref: inputRef, value: input, placeholder: `Talk to ${agent.name}...`, onChange: (e: React.ChangeEvent<HTMLInputElement>)=>setInput(e.target.value), onKeyDown: (e: React.KeyboardEvent)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); void handleSend() } }, style: { flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:'#fafafa' } }),
        createElement('button', { onClick: ()=>void handleSend(), disabled: !input.trim()||streaming, style: { width:32, height:32, borderRadius:999, background: input.trim()&&!streaming ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#27272a', color: input.trim()&&!streaming ? '#fff':'#52525b', border:'none', cursor: input.trim()&&!streaming?'pointer':'default', display:'grid', placeItems:'center' } }, '↑')
      ),
      createElement('div', { style: { fontSize:10, color:'#52525b', textAlign:'center' as const, marginTop:6 } }, `Talking to ${agent.name} • Enter to send • Menu to switch`)
    )
  )
}
const root=document.getElementById('root')
if(root) createRoot(root).render(createElement(SidebarApp))
