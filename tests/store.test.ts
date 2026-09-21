import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ---- Mock Electron before importing the store (vi.mock is hoisted) ----
const TEST_ROOT = join(tmpdir(), 'bb-store-test')
vi.mock('electron', () => ({
  app: { getPath: () => TEST_ROOT }
}))

import { store } from '../src/main/utils/store'
import { DEFAULT_AI_PROVIDERS } from '@shared/constants/defaults'

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true })
})

describe('store (Electron)', () => {
  it('returns defaults when empty', () => {
    expect(store.getProviders()[0]!.id).toBe('local-smollm135')
    expect(store.getComposio().enabled).toBe(false)
  })

  it('setProvider does not mutate shared defaults', () => {
    store.setProvider({ id: 'openai', label: 'O', enabled: true, model: 'm', apiKey: 'sk-x' })
    expect(DEFAULT_AI_PROVIDERS.find((p) => p.id === 'openai')?.apiKey).toBeUndefined()
    expect(store.getProvider('openai')?.apiKey).toBe('sk-x')
  })

  it('persists providers + composio encrypted at rest', async () => {
    const { readFileSync } = await import('node:fs')
    store.setProvider({ id: 'openai', label: 'O', enabled: true, model: 'm', apiKey: 'sk-secret' })
    store.setComposio({ enabled: true, baseUrl: 'https://connect.composio.dev/mcp', consumerKey: 'ck-secret' })
    const raw = readFileSync(join(TEST_ROOT, 'blueberry-store.json'), 'utf-8')
    expect(raw).not.toContain('sk-secret')
    expect(raw).not.toContain('ck-secret')
    expect(store.getProvider('openai')?.apiKey).toBe('sk-secret')
    expect(store.getComposio().consumerKey).toBe('ck-secret')
  })

  it('falls back to defaults on corrupt store', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(TEST_ROOT, { recursive: true })
    writeFileSync(join(TEST_ROOT, 'blueberry-store.json'), '{corrupt json', 'utf-8')
    vi.resetModules()
    const fresh = (await import('../src/main/utils/store')) as typeof import('../src/main/utils/store')
    expect(fresh.store.getProviders()[0]!.id).toBe('local-smollm135')
  })
})
