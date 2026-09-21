import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Full browser stub BEFORE importing background.ts (top-level listeners run on import) ----
const memStore: Record<string, unknown> = {}
const sent: Array<{ type: string; payload?: unknown }> = []
let onMessageHandler: ((msg: unknown, sender: unknown) => Promise<unknown>) | null = null
let fakeTabs: Array<{ id?: number; url?: string; title?: string; hidden?: boolean; pinned?: boolean }> = []

vi.stubGlobal('browser', {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memStore[key] }),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(memStore, obj)
      }
    }
  },
  tabs: {
    query: async () => fakeTabs,
    create: async ({ url }: { url: string }) => ({ id: 42, url }),
    executeScript: async () => [{ title: 'T', url: 'https://x.com', markdown: 'md', excerpt: 'md' }],
    onUpdated: { addListener: () => {} },
    onActivated: { addListener: () => {} },
    onCreated: { addListener: () => {} },
    onRemoved: { addListener: () => {} }
  },
  runtime: {
    id: 'test-id',
    onMessage: {
      addListener: (fn: (msg: unknown, sender: unknown) => Promise<unknown>) => {
        onMessageHandler = fn
      }
    },
    sendMessage: async (msg: unknown) => {
      sent.push(msg as { type: string; payload?: unknown })
      return null
    }
  },
  contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
  commands: { onCommand: { addListener: () => {} } },
  sidebarAction: { open: async () => {} }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Dynamic import AFTER stubs (module runs top-level browser.* calls on import;
// static imports are hoisted and would execute before vi.stubGlobal)
import { beforeAll } from 'vitest'
beforeAll(async () => {
  await import('../src/firefox/extension/background/background')
})

async function send(type: string, payload?: unknown): Promise<unknown> {
  if (!onMessageHandler) throw new Error('router not registered')
  return onMessageHandler({ type, payload }, {})
}

beforeEach(() => {
  fetchMock.mockReset()
  sent.length = 0
  for (const k of Object.keys(memStore)) delete memStore[k]
  fakeTabs = []
})

describe('background message router', () => {
  it('registers router on import', () => {
    expect(onMessageHandler).not.toBeNull()
  })

  it('GET_PROVIDERS returns defaults when empty, roundtrips SET', async () => {
    const initial = (await send('BLUEBERRY_GET_PROVIDERS')) as Array<{ id: string }>
    expect(initial[0]!.id).toBe('local-smollm135')
    await send('BLUEBERRY_SET_PROVIDER', { id: 'openai', label: 'O', enabled: true, model: 'm', apiKey: 'sk-x' })
    const after = (await send('BLUEBERRY_GET_PROVIDERS')) as Array<{ id: string; apiKey?: string }>
    expect(after.find((p) => p.id === 'openai')?.apiKey).toBe('sk-x')
  })

  it('SET_PROVIDER does not mutate shared defaults', async () => {
    const { DEFAULT_AI_PROVIDERS } = await import('@shared/constants/defaults')
    await send('BLUEBERRY_SET_PROVIDER', { id: 'openai', label: 'O', enabled: true, model: 'm', apiKey: 'sk-x' })
    expect(DEFAULT_AI_PROVIDERS.find((p) => p.id === 'openai')?.apiKey).toBeUndefined()
  })

  it('CHAT with keyless cloud provider returns configure hint (no fetch)', async () => {
    const res = (await send('BLUEBERRY_CHAT', {
      providerId: 'openai',
      messages: [{ role: 'user', content: 'hi' }]
    })) as { text: string }
    expect(res.text).toMatch(/no API key/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('CHAT routes local provider via fetch', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: 'local hi' } }) } as Response)
    const res = (await send('BLUEBERRY_CHAT', {
      providerId: 'local-smollm135',
      messages: [{ role: 'user', content: 'hi' }]
    })) as { text: string }
    expect(res.text).toBe('local hi')
  })

  it('EXTRACT delegates to content script', async () => {
    fakeTabs = [{ id: 7, url: 'https://x.com', title: 'T' }]
    const res = (await send('BLUEBERRY_EXTRACT', { tabId: 7 })) as { markdown: string } | null
    expect(res?.markdown).toBe('md')
  })

  it('TABS_LIST maps browser tabs', async () => {
    fakeTabs = [{ id: 3, url: 'https://a.com', title: 'A' }]
    const res = (await send('BLUEBERRY_TABS_LIST')) as Array<{ id: string; url: string }>
    expect(res).toEqual([
      expect.objectContaining({ id: '3', url: 'https://a.com', title: 'A', spaceId: 'space-personal' })
    ])
  })

  it('workspace switch broadcasts change', async () => {
    fakeTabs = [{ id: 1, url: 'https://a.com' }]
    await send('BLUEBERRY_SET_WORKSPACE', { id: 'space-work' })
    expect(sent.some((m) => m.type === 'BLUEBERRY_WORKSPACES_CHANGED')).toBe(true)
    const ws = (await send('BLUEBERRY_GET_WORKSPACES')) as { activeId: string; spaces: Array<{ id: string }> }
    expect(ws.activeId).toBe('space-work')
    expect(ws.spaces.map((s) => s.id)).toContain('space-personal')
  })

  it('unknown message returns null', async () => {
    expect(await send('NOPE')).toBeNull()
  })
})
