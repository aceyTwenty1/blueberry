/**
 * Blueberry Sidebar — Premium Firefox sidebar_action
 * Insanely good: glass, gradients, Arc/Linear polish, motion, Raycast-grade details.
 */

import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

// browser is global in Firefox MV2 — types from @types/firefox-webext-browser

function extractDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.slice(0, 32) }
}

function SidebarApp() {
  const [input, setInput] = useState('')
  const [provider, setProvider] = useState('local-smollm135')
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Hey — I’m **Blueberry**. I’m your in-page co-pilot. Ask me anything about this tab, or hit `⌘K` for instant actions. Try “Summarize” or “Extract tables” below.' }
  ])
  const [contextUrl, setContextUrl] = useState('')
  const [contextTitle, setContextTitle] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      setContextUrl(tabs[0]?.url ?? '')
      setContextTitle(tabs[0]?.title ?? '')
    }).catch(() => {})
    // Listen for tab changes + quick actions
    const listener = (msg: unknown) => {
      const m = msg as { type?: string; payload?: unknown }
      if (m.type === 'BLUEBERRY_TAB_ACTIVATED' || m.type === 'BLUEBERRY_TAB_UPDATED') {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
          setContextUrl(tabs[0]?.url ?? '')
          setContextTitle(tabs[0]?.title ?? '')
        })
      }
      if (m.type === 'BLUEBERRY_QUICK_ACTION') {
        const action = (m.payload as { action?: string })?.action ?? 'summarize'
        const map: Record<string, string> = {
          'blueberry-summarize': 'Summarize this page in concise, beautiful bullet points. Keep key numbers and links.',
          'blueberry-extract-tables': 'Extract all tables on this page as clean markdown.',
          'blueberry-qa': 'What is this page about? Give me the key takeaways.',
          'summarize': 'Summarize this page in concise bullet points.',
          'extract-tables': 'Extract all tables as markdown.',
          'pricing': 'Find and summarize pricing plans on this page.',
          'clean': 'Rewrite this page as clean reader-mode markdown.',
        }
        void handleSend(map[action] ?? `Quick action: ${action}`, true)
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
    browser.runtime.onMessage.addListener(listener as never)
    return () => { try { (browser.runtime.onMessage as unknown as { removeListener: (cb: unknown) => void }).removeListener(listener as never) } catch {} }
  }, [])

  async function handleSend(textOverride?: string, isQuick = false) {
    const text = (textOverride ?? input).trim()
    if (!text) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: text }])
    setStreaming(true)
    // Ensure assistant bubble exists for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      let ctx: unknown = undefined
      if (!isQuick) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true })
        const tabId = tabs[0]?.id
        if (tabId) ctx = await browser.runtime.sendMessage({ type: 'BLUEBERRY_EXTRACT', payload: { tabId } }).catch(() => null)
      }

      // Prefer streaming path if available
      const hasStream = true
      if (hasStream) {
        // Reset last assistant bubble to empty, then stream via BLUEBERRY_CHUNK events
        // Also fallback: if no chunks in 800ms, do non-stream
        let gotChunk = false
        const chunkListener = (msg: unknown) => {
          const m = msg as { type?: string; payload?: { delta: string; done: boolean } }
          if (m.type === 'BLUEBERRY_CHUNK') {
            gotChunk = true
            if (m.payload?.done) setStreaming(false)
          }
        }
        browser.runtime.onMessage.addListener(chunkListener as never)
        await browser.runtime.sendMessage({
          type: 'BLUEBERRY_CHAT_STREAM',
          payload: { providerId: provider, messages: [...messages, { role: 'user', content: text }], context: ctx }
        }).catch(async () => {
          // Fallback to non-stream
          const result = await browser.runtime.sendMessage({
            type: 'BLUEBERRY_CHAT',
            payload: { providerId: provider, messages: [...messages, { role: 'user', content: text }], context: ctx }
          }) as { text?: string } | null
          const reply = result?.text ?? 'No response.'
          // Replace last bubble
          setMessages(prev => {
            const withoutLast = prev.slice(0, -1)
            return [...withoutLast, { role: 'assistant', content: reply }]
          })
          setStreaming(false)
        })
        // If after 1s no chunk, fallback already handled; cleanup listener after done
        setTimeout(() => {
          try { (browser.runtime.onMessage as unknown as { removeListener: (cb: unknown) => void }).removeListener(chunkListener as never) } catch {}
          if (!gotChunk) setStreaming(false)
        }, 4000)
        // Note: actual chunk appending handled by global listener above (BLUEBERRY_CHUNK)
      } else {
        const result = await browser.runtime.sendMessage({
          type: 'BLUEBERRY_CHAT',
          payload: { providerId: provider, messages: [...messages, { role: 'user', content: text }], context: ctx }
        }) as { text?: string } | null
        const reply = result?.text ?? 'No response.'
        setMessages(prev => {
          const withoutLast = prev.slice(0, -1)
          return [...withoutLast, { role: 'assistant', content: reply }]
        })
        setStreaming(false)
      }
    } catch (e) {
      setMessages(m => {
        // Replace streaming bubble with error
        const withoutLast = m.slice(0, -1)
        const last = m[m.length - 1]
        if (last?.role === 'assistant' && last.content === '') return [...withoutLast, { role: 'assistant', content: `⚠️ Error: ${String(e).slice(0,400)}` }]
        return [...m, { role: 'assistant', content: `⚠️ Error: ${String(e).slice(0,400)}` }]
      })
      setStreaming(false)
    }
  }

  const quickActions = [
    { id: 'summarize', label: 'Summarize', desc: 'Bullet points', icon: '◐', grad: 'from-indigo-500 to-violet-500', prompt: 'Summarize this page in concise, beautiful bullet points. Keep key numbers.' },
    { id: 'extract-tables', label: 'Extract tables', desc: 'As markdown', icon: '▦', grad: 'from-emerald-500 to-teal-500', prompt: 'Extract all tables on this page as clean markdown with headers.' },
    { id: 'pricing', label: 'Pricing', desc: 'Find plans', icon: '◈', grad: 'from-amber-500 to-orange-500', prompt: 'Find and summarize pricing plans, tiers, and comparisons.' },
    { id: 'clean', label: 'Clean view', desc: 'Reader mode', icon: '✦', grad: 'from-fuchsia-500 to-pink-500', prompt: 'Rewrite this page as clean, distraction-free markdown — reader mode.' },
  ]

  // Render helpers
  const header = createElement('div', { className: 'sticky top-0 z-10 glass-strong', style: { height: 56, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(39,39,42,0.8)', backdropFilter: 'blur(20px)' } },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      createElement('div', { className: 'bg-blueberry', style: { width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: '0 4px 12px rgba(99,102,241,0.4)', border: '1px solid rgba(255,255,255,0.15)' } }, '◐'),
      createElement('div', { style: { lineHeight: 1 } },
        createElement('div', { style: { fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: '#fafafa', display: 'flex', alignItems: 'center', gap: 6 } },
          'Blueberry',
          createElement('span', { style: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', letterSpacing: '0.06em' } }, 'BETA')
        ),
        createElement('div', { style: { fontSize: 11, color: '#71717a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 } },
          createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#10b981', boxShadow: '0 0 0 4px rgba(16,185,129,0.15)', animation: 'pulse-live 2s infinite' } }),
          'AI • Firefox — Gecko'
        )
      )
    ),
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, position: 'relative' } },
      createElement('button', {
        onClick: () => setShowProviderMenu(v => !v),
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#27272a', border: '1px solid #3f3f46', color: '#d4d4d8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
      },
        createElement('span', { style: { width: 7, height: 7, borderRadius: 999, background: provider === 'ollama' ? '#10b981' : '#6366f1' } }),
        provider,
        createElement('span', { style: { fontSize: 10, opacity: 0.6 } }, '▾')
      ),
      showProviderMenu ? createElement('div', { className: 'glass', style: { position: 'absolute', top: 36, right: 0, width: 200, padding: 6, borderRadius: 12, background: 'rgba(24,24,27,0.96)', border: '1px solid #3f3f46', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 20 } },
        ...(['local-smollm135','ollama','openai','anthropic','gemini','deepseek','huggingface'] as const).map(p =>
          createElement('button', {
            key: p,
            onClick: () => { setProvider(p); setShowProviderMenu(false) },
            style: { width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: provider === p ? '#27272a' : 'transparent', color: provider === p ? '#fafafa' : '#d4d4d8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
          }, (provider === p ? '● ' : '○ ') + (p === 'local-smollm135' ? 'Local 135M (puny)' : p))
        )
      ) : null,
      createElement('button', { title: 'Focus input', onClick: () => inputRef.current?.focus(), style: { width: 32, height: 32, borderRadius: 10, background: '#18181b', border: '1px solid #27272a', color: '#71717a', display: 'grid', placeItems: 'center', cursor: 'pointer' } }, '⌘')
    )
  )

  const qaGrid = createElement('div', { style: { padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderBottom: '1px solid rgba(39,39,42,0.6)', background: 'linear-gradient(180deg, rgba(24,24,27,0.6) 0%, transparent 100%)' } },
    ...quickActions.map(a =>
      createElement('button', {
        key: a.id,
        onClick: () => void handleSend(a.prompt, true),
        className: 'qa-card',
        style: {
          textAlign: 'left', padding: 12, borderRadius: 16, background: '#18181b', border: '1px solid #27272a', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        } as React.CSSProperties,
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f46'
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)'
        },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#27272a'
          ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)'
        }
      },
        createElement('div', { style: { width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg, var(--tw-gradient-stops))`, backgroundImage: `linear-gradient(135deg, ${a.grad.includes('indigo') ? '#6366f1, #8b5cf6' : a.grad.includes('emerald') ? '#10b981, #06b6d4' : a.grad.includes('amber') ? '#f59e0b, #f97316' : '#ec4899, #8b5cf6'})`, boxShadow: '0 4px 10px rgba(0,0,0,0.2)' } }, a.icon),
        createElement('div', { style: { marginTop: 10, fontSize: 12, fontWeight: 700, color: '#fafafa', letterSpacing: '-0.01em' } }, a.label),
        createElement('div', { style: { fontSize: 11, color: '#71717a', fontWeight: 500 } }, a.desc),
        createElement('div', { style: { position: 'absolute', top: 10, right: 10, fontSize: 10, color: '#52525b' } }, '↗')
      )
    )
  )

  const contextBar = createElement('div', { style: { padding: '10px 14px', borderBottom: '1px solid rgba(39,39,42,0.6)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(9,9,11,0.6)' } },
    createElement('div', { style: { width: 28, height: 28, borderRadius: 8, background: '#27272a', border: '1px solid #3f3f46', display: 'grid', placeItems: 'center', color: '#71717a', fontSize: 12 } }, '◐'),
    createElement('div', { style: { flex: 1, minWidth: 0 } },
      createElement('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#71717a', textTransform: 'uppercase' as const } }, 'Context'),
      createElement('div', { style: { fontSize: 12, fontWeight: 500, color: '#d4d4d8', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 } },
        createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#10b981', flexShrink: 0 } }),
        contextTitle ? `${contextTitle} — ${extractDomain(contextUrl)}` : (contextUrl ? extractDomain(contextUrl) : 'No active tab')
      )
    ),
    createElement('button', {
      onClick: async () => {
        try { await navigator.clipboard.writeText(contextUrl); } catch {}
      },
      style: { padding: '6px 8px', borderRadius: 8, background: '#18181b', border: '1px solid #27272a', color: '#71717a', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
    }, 'Copy')
  )

  const messagesEl = createElement('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column' as const, gap: 14, background: 'radial-gradient(600px 300px at 50% -50px, rgba(99,102,241,0.08), transparent 70%), radial-gradient(800px 400px at 100% 0%, rgba(139,92,246,0.06), transparent 60%)' } },
    ...messages.map((m, i) => {
      const isUser = m.role === 'user'
      const isLastStreaming = streaming && i === messages.length - 1 && m.role === 'assistant' && m.content === ''
      // Skip empty streaming bubble will show dots
      if (isLastStreaming) {
        return createElement('div', { key: i, style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
          createElement('div', { className: 'bg-blueberry', style: { width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0, marginTop: 2 } }, '✦'),
          createElement('div', { style: { padding: '10px 14px', borderRadius: 16, background: '#18181b', border: '1px solid #27272a', display: 'flex', gap: 4, alignItems: 'center' } },
            createElement('span', { className: 'dot', style: { width: 6, height: 6, borderRadius: 999, background: '#71717a', display: 'inline-block' } }),
            createElement('span', { className: 'dot', style: { width: 6, height: 6, borderRadius: 999, background: '#71717a', display: 'inline-block' } }),
            createElement('span', { className: 'dot', style: { width: 6, height: 6, borderRadius: 999, background: '#71717a', display: 'inline-block' } }),
          )
        )
      }
      if (!m.content && i === messages.length - 1 && m.role === 'assistant') return null
      return createElement('div', { key: i, className: 'animate-slide-in', style: { display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: isUser ? 'flex-end' : 'flex-start' } },
        !isUser ? createElement('div', { className: 'bg-blueberry', style: { width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0, marginTop: 2, boxShadow: '0 4px 10px rgba(99,102,241,0.3)' } }, '✦') : null,
        createElement('div', {
          style: {
            maxWidth: '78%', padding: isUser ? '10px 14px' : '11px 14px', borderRadius: 18, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
            background: isUser ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#18181b',
            color: isUser ? '#fff' : '#e4e4e7',
            border: isUser ? '1px solid rgba(255,255,255,0.15)' : '1px solid #27272a',
            boxShadow: isUser ? '0 8px 16px rgba(79,70,229,0.25)' : '0 1px 2px rgba(0,0,0,0.3)',
            borderBottomRightRadius: isUser ? 6 : 18,
            borderBottomLeftRadius: isUser ? 18 : 6,
          }
        }, m.content),
        isUser ? createElement('div', { style: { width: 28, height: 28, borderRadius: 999, background: '#27272a', border: '1px solid #3f3f46', display: 'grid', placeItems: 'center', color: '#a1a1aa', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2 } }, 'You') : null
      )
    }),
    streaming && messages[messages.length - 1]?.content?.length ? createElement('div', { style: { fontSize: 11, color: '#52525b', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 38 } },
      createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#6366f1', animation: 'pulse-live 1.2s infinite' } }),
      'Generating…'
    ) : null,
    createElement('div', { ref: bottomRef, style: { height: 1 } })
  )

  const composer = createElement('div', { className: 'glass-strong', style: { padding: 12, borderTop: '1px solid rgba(39,39,42,0.8)', position: 'sticky' as const, bottom: 0 } },
    createElement('form', {
      onSubmit: (e: React.FormEvent) => { e.preventDefault(); void handleSend() },
      style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 12px', borderRadius: 16, background: '#18181b', border: '1px solid #27272a', boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)', transition: 'border-color 0.2s, box-shadow 0.2s' },
      onFocus: (e: React.FocusEvent) => { (e.currentTarget as HTMLFormElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLFormElement).style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15), 0 4px 16px rgba(0,0,0,0.3)' },
      onBlur: (e: React.FocusEvent) => { (e.currentTarget as HTMLFormElement).style.borderColor = '#27272a'; (e.currentTarget as HTMLFormElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)' }
    },
      createElement('span', { style: { color: '#52525b', fontSize: 14 } }, '✦'),
      createElement('input', {
        ref: inputRef,
        value: input,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } },
        placeholder: 'Ask about this page…  (⌘K for palette)',
        style: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fafafa', fontSize: 13, fontWeight: 500, padding: '4px 0' }
      }),
      createElement('button', {
        type: 'submit', disabled: !input.trim() || streaming,
        style: {
          width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', cursor: !input.trim() || streaming ? 'not-allowed' : 'pointer',
          background: !input.trim() || streaming ? '#27272a' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: !input.trim() || streaming ? '#52525b' : '#fff', boxShadow: !input.trim() || streaming ? 'none' : '0 4px 12px rgba(99,102,241,0.4)', opacity: !input.trim() || streaming ? 0.7 : 1, transition: 'all 0.2s'
        }
      }, '↑')
    ),
    createElement('div', { style: { marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#52525b' } },
      createElement('span', {}, '↵ send • ⇧↵ new line'),
      createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        createElement('span', { style: { width: 6, height: 6, borderRadius: 999, background: '#10b981' } }),
        'Gecko • Encrypted'
      )
    )
  )

  return createElement('div', { style: { height: '100vh', display: 'flex', flexDirection: 'column' as const, background: '#09090b', color: '#fafafa', overflow: 'hidden' } },
    header, qaGrid, contextBar, messagesEl, composer
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(createElement(SidebarApp))
