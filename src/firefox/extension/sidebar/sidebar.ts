/**
 * Blueberry Sidebar — Simple Strawberry mode
 * One menu to pick agent, one input to talk. No gradients, no 2x2 grid.
 */

import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

type Agent = { id: string; name: string; desc: string; icon: string; prompt: string }

const AGENTS: Agent[] = [
  { id: 'general', name: 'Blueberry', desc: 'Ask anything', icon: '◐', prompt: '' },
  { id: 'summarize', name: 'Summarizer', desc: 'Bullet points', icon: '◐', prompt: 'Summarize this page in 5 concise bullet points.' },
  { id: 'extract', name: 'Extractor', desc: 'Tables → markdown', icon: '▦', prompt: 'Extract all tables as markdown.' },
  { id: 'pricing', name: 'Pricing', desc: 'Find plans', icon: '◈', prompt: 'Find pricing plans and compare tiers.' },
  { id: 'clean', name: 'Reader', desc: 'Clean view', icon: '✦', prompt: 'Rewrite as clean reader-mode markdown.' },
]

function SidebarApp() {
  const [input, setInput] = useState('')
  const [agentId, setAgentId] = useState('general')
  const [menuOpen, setMenuOpen] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Hi — pick an agent from the menu and ask about this page.' }
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
    const fullPrompt = agent.id === 'general' ? text : `${agent.prompt}\n\nUser: ${text}`
    setMessages(m => [...m, { role: 'user', content: text }])
    setStreaming(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    setMenuOpen(false)

    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      const tabId = tabs[0]?.id
      let ctx: unknown = undefined
      if (tabId) ctx = await browser.runtime.sendMessage({ type: 'BLUEBERRY_EXTRACT', payload: { tabId } }).catch(() => null)

      // Stream
      const prov = (await browser.runtime.sendMessage({ type: 'BLUEBERRY_GET_PROVIDERS' }).catch(() => null) as Array<{ id: string }> | null)?.[0]?.id ?? 'local-smollm135'
      let gotChunk = false
      const chunkL = (msg: unknown) => {
        const mm = msg as { type?: string; payload?: { done?: boolean } }
        if (mm.type === 'BLUEBERRY_CHUNK' && !mm.payload?.done) gotChunk = true
      }
      browser.runtime.onMessage.addListener(chunkL as never)
      await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHAT_STREAM', payload: { providerId: prov, messages: [{ role: 'user', content: fullPrompt }], context: ctx } }).catch(async () => {
        const r = await browser.runtime.sendMessage({ type: 'BLUEBERRY_CHAT', payload: { providerId: prov, messages: [{ role: 'user', content: fullPrompt }], context: ctx } }) as { text?: string } | null
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

  return createElement('div', { style: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#111', fontFamily: 'Inter, system-ui, sans-serif' } },
    // Header — simple
    createElement('div', { style: { height: 48, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', background: '#fff', position: 'relative' } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        createElement('div', { style: { width: 26, height: 26, borderRadius: 8, background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12 } }, '◐'),
        createElement('span', { style: { fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em' } }, 'Blueberry'),
        createElement('span', { style: { fontSize: 11, color: '#6b7280' } }, '· ' + agent.name)
      ),
      createElement('button', { onClick: () => setMenuOpen(v => !v), style: { padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: menuOpen ? '#111' : '#fff', color: menuOpen ? '#fff' : '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer' } }, menuOpen ? 'Close' : 'Menu')
    ),

    // Menu — simple list to talk to agents
    menuOpen ? createElement('div', { style: { borderBottom: '1px solid #e5e7eb', background: '#f9fafb', padding: 8 } },
      createElement('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#6b7280', padding: '4px 8px' } }, 'TALK TO AN AGENT'),
      ...AGENTS.map(a =>
        createElement('button', {
          key: a.id,
          onClick: () => { setAgentId(a.id); setMenuOpen(false); setTimeout(() => inputRef.current?.focus(), 50) },
          style: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 10, border: agentId === a.id ? '1px solid #111' : '1px solid transparent', background: agentId === a.id ? '#fff' : 'transparent', cursor: 'pointer', textAlign: 'left' as const }
        },
          createElement('span', { style: { width: 28, height: 28, borderRadius: 8, background: agentId === a.id ? '#111' : '#e5e7eb', color: agentId === a.id ? '#fff' : '#374151', display: 'grid', placeItems: 'center', fontSize: 12 } }, a.icon),
          createElement('span', { style: { flex: 1 } },
            createElement('div', { style: { fontSize: 13, fontWeight: 600, lineHeight: 1 } }, a.name),
            createElement('div', { style: { fontSize: 11, color: '#6b7280' } }, a.desc)
          ),
          agentId === a.id ? createElement('span', { style: { fontSize: 12 } }, '✓') : null
        )
      ),
      createElement('div', { style: { fontSize: 11, color: '#9ca3af', padding: '6px 8px', textAlign: 'center' as const } }, 'Pick an agent, then ask below. Context from current tab is auto-attached.')
    ) : null,

    // Context — tiny
    createElement('div', { style: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', background: '#fff', display: 'flex', alignItems: 'center', gap: 8 } },
      createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#10b981' } }),
      createElement('span', { style: { fontSize: 11, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } }, contextUrl ? new URL(contextUrl).hostname.replace(/^www\./, '') : 'No tab'),
      createElement('button', { onClick: () => setMenuOpen(true), style: { fontSize: 11, fontWeight: 600, color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer' } }, agent.name + ' ▾')
    ),

    // Messages — simple bubbles
    createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' } },
      ...messages.map((m, i) => {
        if (!m.content && m.role === 'assistant' && streaming && i === messages.length - 1) {
          return createElement('div', { key: i, style: { display: 'flex', gap: 8 } },
            createElement('span', { style: { width: 24, height: 24, borderRadius: 999, background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10 } }, '✦'),
            createElement('span', { style: { fontSize: 12, color: '#6b7280', padding: 8 } }, 'Thinking...')
          )
        }
        if (!m.content) return null
        const isUser = m.role === 'user'
        return createElement('div', { key: i, style: { display: 'flex', justifyContent: isUser ? 'flex-end' as const : 'flex-start' as const } },
          createElement('div', { style: { maxWidth: '85%', padding: '8px 12px', borderRadius: 16, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, background: isUser ? '#111' : '#f3f4f6', color: isUser ? '#fff' : '#111', border: isUser ? 'none' : '1px solid #e5e7eb', borderBottomRightRadius: isUser ? 4 : 16, borderBottomLeftRadius: isUser ? 16 : 4 } }, m.content)
        )
      }),
      createElement('div', { ref: bottomRef })
    ),

    // Input — simple pill + menu button
    createElement('div', { style: { padding: 10, borderTop: '1px solid #e5e7eb', background: '#fff' } },
      createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px 6px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#f9fafb' } },
        createElement('button', { onClick: () => setMenuOpen(v => !v), title: 'Choose agent', style: { width: 28, height: 28, borderRadius: 999, background: '#111', color: '#fff', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 12 } }, '≡'),
        createElement('input', {
          ref: inputRef, value: input, placeholder: `Talk to ${agent.name}...`,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } },
          style: { flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#111' }
        }),
        createElement('button', { onClick: () => void handleSend(), disabled: !input.trim() || streaming, style: { width: 32, height: 32, borderRadius: 999, background: input.trim() && !streaming ? '#111' : '#e5e7eb', color: input.trim() && !streaming ? '#fff' : '#9ca3af', border: 'none', cursor: input.trim() && !streaming ? 'pointer' : 'default', display: 'grid', placeItems: 'center' } }, '↑')
      ),
      createElement('div', { style: { fontSize: 10, color: '#9ca3af', textAlign: 'center' as const, marginTop: 6 } }, `Talking to ${agent.name} • Enter to send • Menu to switch agent`)
    )
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(createElement(SidebarApp))
