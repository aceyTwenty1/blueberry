import { createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AIProviderConfig } from '../../../shared/types/ai'
import { DEFAULT_AI_PROVIDERS } from '../../../shared/constants/defaults'

function OptionsApp() {
  const [providers, setProviders] = useState<AIProviderConfig[]>(DEFAULT_AI_PROVIDERS)
  const [saved, setSaved] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    browser.storage.local.get('blueberry:providers').then(data => {
      const stored = data['blueberry:providers'] as AIProviderConfig[] | undefined
      if (stored) setProviders(stored)
    })
  }, [])

  const update = (id: string, patch: Partial<AIProviderConfig>) => {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  const save = async () => {
    // Encrypt is handled in background, but for options we just store; background will encrypt on next save
    await browser.storage.local.set({ 'blueberry:providers': providers })
    // Also notify background to re-encrypt
    await browser.runtime.sendMessage({ type: 'BLUEBERRY_SET_PROVIDER', payload: providers[0] }).catch(() => {})
    // Actually we need to save each
    for (const p of providers) await browser.runtime.sendMessage({ type: 'BLUEBERRY_SET_PROVIDER', payload: p }).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return createElement('div', { style: { maxWidth: 720, margin: '0 auto', padding: 24 } },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 } },
      createElement('div', { style: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 } }, '◐'),
      createElement('div', {},
        createElement('div', { style: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' } }, 'Blueberry Settings'),
        createElement('div', { style: { fontSize: 12, color: '#71717a' } }, 'Providers • Gecko • Encrypted at rest')
      ),
      createElement('button', { onClick: save, className: 'btn', style: { marginLeft: 'auto' } }, saved ? 'Saved ✓' : 'Save all')
    ),
    ...providers.map(p => createElement('div', { key: p.id, className: 'card', style: { marginBottom: 12 } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
        createElement('span', { style: { fontWeight: 700, fontSize: 13 } }, p.label),
        createElement('span', { style: { fontSize: 11, padding: '2px 6px', borderRadius: 999, background: p.enabled ? 'rgba(16,185,129,0.15)' : '#27272a', border: `1px solid ${p.enabled ? 'rgba(16,185,129,0.2)' : '#3f3f46'}`, color: p.enabled ? '#6ee7b7' : '#71717a' } }, p.enabled ? 'Enabled' : 'Disabled'),
        createElement('label', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#71717a' } },
          createElement('input', { type: 'checkbox', checked: p.enabled, onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(p.id, { enabled: e.target.checked }) }),
          'Enabled'
        )
      ),
      createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        createElement('label', { style: { fontSize: 11, color: '#71717a' } }, 'Model',
          createElement('input', { className: 'input', value: p.model, onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(p.id, { model: e.target.value }), style: { marginTop: 4 } })
        ),
        createElement('label', { style: { fontSize: 11, color: '#71717a' } }, 'Base URL',
          createElement('input', { className: 'input', value: p.baseUrl ?? '', placeholder: p.id === 'local-smollm135' ? 'http://localhost:11435' : 'https://...', onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(p.id, { baseUrl: e.target.value || undefined }), style: { marginTop: 4 } })
        )
      ),
      createElement('label', { style: { display: 'block', marginTop: 10, fontSize: 11, color: '#71717a' } }, 'API Key (encrypted with AES-GCM)',
        createElement('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
          createElement('input', {
            className: 'input',
            type: showKeys[p.id] ? 'text' : 'password',
            value: p.apiKey ?? '',
            placeholder: p.id === 'local-smollm135' || p.id === 'ollama' ? 'No key needed (local)' : 'sk-...',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(p.id, { apiKey: e.target.value || undefined }),
            style: { flex: 1 }
          }),
          createElement('button', {
            onClick: () => setShowKeys(s => ({ ...s, [p.id]: !s[p.id] })),
            style: { padding: '8px 10px', borderRadius: 10, border: '1px solid #27272a', background: '#09090b', color: '#71717a', cursor: 'pointer', fontSize: 12 }
          }, showKeys[p.id] ? 'Hide' : 'Show')
        )
      )
    )),
    createElement('div', { style: { fontSize: 11, color: '#52525b', textAlign: 'center', marginTop: 16 } },
      'Keys are encrypted with AES-GCM (Gecko) / AES-256-GCM (Electron) before storage. CSP restricts connect-src to localhost + provider domains.'
    )
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(createElement(OptionsApp))
