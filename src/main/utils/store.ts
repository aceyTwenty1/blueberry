/**
 * Simple file-backed store for AI provider configs and browser state.
 * Uses Electron's userData path; falls back to in-memory if fs unavailable.
 * Keeps main process stateless for Step 1 (no native store dep yet).
 */
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AIProviderConfig } from '@shared/types/ai'
import { DEFAULT_AI_PROVIDERS } from '@shared/constants/defaults'

interface PersistedState {
  providers: AIProviderConfig[]
}

function getStorePath(): string {
  try {
    return join(app.getPath('userData'), 'blueberry-store.json')
  } catch {
    return join(process.cwd(), '.blueberry-store.json')
  }
}

let cache: PersistedState | null = null

function load(): PersistedState {
  if (cache) return cache
  const p = getStorePath()
  if (existsSync(p)) {
    try {
      cache = JSON.parse(readFileSync(p, 'utf-8')) as PersistedState
      return cache!
    } catch {}
  }
  cache = { providers: DEFAULT_AI_PROVIDERS }
  return cache
}

function save(state: PersistedState): void {
  cache = state
  const p = getStorePath()
  try {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[store] save failed', e)
  }
}

export const store = {
  getProviders(): AIProviderConfig[] {
    return load().providers
  },
  setProvider(config: AIProviderConfig): void {
    const s = load()
    const idx = s.providers.findIndex((p) => p.id === config.id)
    if (idx >= 0) s.providers[idx] = config
    else s.providers.push(config)
    save(s)
  },
  getProvider(id: string): AIProviderConfig | null {
    return load().providers.find((p) => p.id === id) ?? null
  }
}
