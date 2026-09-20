/**
 * Blueberry Crypto — light obfuscation for apiKey in storage.local
 * MV2 background has crypto.subtle. We derive a key from runtime.id + fixed salt.
 * This is NOT a replacement for OS keychain, but prevents plaintext grep of storage.
 * For Electron, same helper is used in src/main/utils/store.ts (Node crypto).
 */

// In Gecko, crypto.subtle is available in background (secure context)
const SALT = 'blueberry-v1-'

async function getKey(): Promise<CryptoKey> {
  const raw = SALT + (typeof browser !== 'undefined' ? (browser.runtime.id ?? 'blueberry') : 'blueberry')
  const enc = new TextEncoder().encode(raw)
  const hash = await crypto.subtle.digest('SHA-256', enc as unknown as ArrayBuffer)
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function b64e(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer)
  return btoa(String.fromCharCode(...u8))
}
function b64d(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

export async function encrypt(value: string): Promise<string> {
  if (!value) return ''
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(value) as unknown as ArrayBuffer)
  return `${b64e(iv)}:${b64e(enc as ArrayBuffer)}`
}

export async function decrypt(token: string): Promise<string> {
  if (!token || !token.includes(':')) return token // fallback for plaintext old entries
  try {
    const [ivB64, dataB64] = token.split(':')
    const key = await getKey()
    const iv = b64d(ivB64)
    const data = b64d(dataB64)
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, data as unknown as BufferSource)
    return new TextDecoder().decode(dec as ArrayBuffer)
  } catch {
    return token // if decrypt fails, return as-is (old plaintext)
  }
}

// Helpers for provider array
export async function encryptProviders(providers: Array<{ apiKey?: string }>): Promise<Array<unknown>> {
  return Promise.all(
    providers.map(async p => {
      if (!p.apiKey) return p
      const enc = await encrypt(p.apiKey)
      return { ...p, apiKey: enc, _enc: true }
    })
  )
}

export async function decryptProviders(providers: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    providers.map(async p => {
      if (!p.apiKey || typeof p.apiKey !== 'string') return p
      if (!p._enc) return p // old plaintext
      const dec = await decrypt(p.apiKey as string)
      const { _enc, ...rest } = p
      return { ...rest, apiKey: dec }
    })
  )
}
