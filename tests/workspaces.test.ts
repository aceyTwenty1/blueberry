import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the WebExtension `browser` global before importing the module
const store: Record<string, unknown> = {}
const hidden: number[] = []
const shown: number[] = []
let tabsList: Array<{ id?: number; hidden?: boolean; pinned?: boolean }> = []
let tabHideAvailable = true

vi.stubGlobal('browser', {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(store, obj)
      }
    }
  },
  tabs: {
    query: async () => tabsList,
    create: async ({ url }: { url: string }) => ({ id: 99, url }),
    get hide() {
      return tabHideAvailable ? async (ids: number[]) => void hidden.push(...ids) : undefined
    },
    get show() {
      return tabHideAvailable ? async (ids: number[]) => void shown.push(...ids) : undefined
    }
  }
})

import {
  getWorkspaces,
  createWorkspace,
  assignTab,
  tabsInWorkspace,
  applyWorkspace,
  getActiveWorkspaceId
} from '../src/firefox/extension/background/workspaces'

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  hidden.length = 0
  shown.length = 0
  tabsList = []
  tabHideAvailable = true
})

describe('workspaces', () => {
  it('returns defaults when storage is empty', async () => {
    const ws = await getWorkspaces()
    expect(ws.map((w) => w.name)).toEqual(['Personal', 'Work', 'Research'])
  })

  it('creates and persists workspaces', async () => {
    const ws = await createWorkspace('Side quest')
    expect(ws.name).toBe('Side quest')
    expect(ws.id).toMatch(/^space-/)
    const all = await getWorkspaces()
    expect(all.map((w) => w.name)).toContain('Side quest')
  })

  it('assigns tabs and lists them per workspace', async () => {
    const ws = await getWorkspaces()
    await assignTab(1, ws[0]!.id)
    await assignTab(2, ws[1]!.id)
    expect(await tabsInWorkspace(ws[0]!.id)).toEqual([1])
    expect(await tabsInWorkspace(ws[1]!.id)).toEqual([2])
  })

  it('switch hides other workspaces and shows ours', async () => {
    const ws = await getWorkspaces()
    tabsList = [{ id: 1 }, { id: 2 }, { id: 3, hidden: true }]
    await assignTab(1, ws[0]!.id)
    await assignTab(2, ws[1]!.id)
    await assignTab(3, ws[0]!.id)
    const res = await applyWorkspace(ws[1]!.id)
    expect(res.tabHide).toBe(true)
    expect(hidden).toEqual([1]) // tab 2 already visible; hidden tab 3 belongs to ws0
    expect(shown).toEqual([])
    expect(res.hidden).toBe(1)
  })

  it('shows hidden tabs of the target workspace', async () => {
    const ws = await getWorkspaces()
    tabsList = [{ id: 7, hidden: true }]
    await assignTab(7, ws[0]!.id)
    const res = await applyWorkspace(ws[0]!.id)
    expect(shown).toEqual([7])
    expect(res.shown).toBe(1)
  })

  it('degrades gracefully without tabHide', async () => {
    tabHideAvailable = false
    const ws = await getWorkspaces()
    tabsList = [{ id: 1 }, { id: 2 }]
    await assignTab(1, ws[0]!.id)
    const res = await applyWorkspace(ws[1]!.id)
    expect(res.tabHide).toBe(false)
    expect(hidden).toEqual([])
    expect(await getActiveWorkspaceId()).toBe(ws[1]!.id)
  })
})
