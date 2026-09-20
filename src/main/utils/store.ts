/**
 * Simple file-backed store for AI provider configs and browser state.
 * Uses Electron's userData path; falls back to in-memory if fs unavailable.
 * Keeps main process stateless for Step 1 (no native store dep yet).
 */
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { AIProviderConfig } from '@shared/types/ai'
import { DEFAULT_AI_PROVIDERS } from '@shared/constants/defaults'

const SALT = 'blueberry-v1-'

function deriveKey(): Buffer {
  try {
    const base = SALT + app.getPath('userData')
    return createHash('sha256').update(base).digest()
  } catch {
    return createHash('sha256').update(SALT + 'fallback').digest()
  }
}

function encryptValue(plain: string): string {
  if (!plain) return ''
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`
}

function decryptValue(token: string): string {
  if (!token || !token.includes(':')) return token
  try {
    const [ivB64, encB64, tagB64] = token.split(':')
    const key = deriveKey()
    const iv = Buffer.from(ivB64, 'base64')
    const enc = Buffer.from(encB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(enc), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return token
  }
}

function encryptProviders(providers: AIProviderConfig[]): AIProviderConfig[] {
  return providers.map(p => {
    if (!p.apiKey) return p
    // avoid double-encrypt if already looks encrypted (contains : and base64)
    if (p.apiKey.includes(':') && p.apiKey.length > 40) return p
    return { ...p, apiKey: encryptValue(p.apiKey) }
  })
}

function decryptProviders(providers: AIProviderConfig[]): AIProviderConfig[] {
  return providers.map(p => {
    if (!p.apiKey) return p
    const dec = decryptValue(p.apiKey)
    return dec === p.apiKey ? p : { ...p, apiKey: dec }
  })
}

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
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as PersistedState
      raw.providers = decryptProviders(raw.providers)
      cache = raw
      return cache!
    } catch {}
  }
  cache = { providers: DEFAULT_AI_PROVIDERS }
  return cache
}

function save(state: PersistedState): void {
  // encrypt before writing, but keep cache decrypted
  const toPersist: PersistedState = { providers: encryptProviders(state.providers) }
  cache = state
  const p = getStorePath()
  try {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, JSON.stringify(toPersist, null, 2), 'utf-8')
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
