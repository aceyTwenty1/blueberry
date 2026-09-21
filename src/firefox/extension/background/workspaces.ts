/**
 * Workspaces — Zen-style tab grouping for the Gecko sidebar.
 * Tabs are assigned to workspaces (default: Personal / Work / Research);
 * switching hides other workspaces' tabs when `tabHide` is available,
 * and always filters the sidebar tab strip. Graceful without tabHide.
 */
import type { Space } from '../../../shared/types/tab'
import { DEFAULT_SPACES } from '../../../shared/constants/defaults'

export const WORKSPACE_KEY = 'blueberry:workspaces'
export const ACTIVE_WORKSPACE_KEY = 'blueberry:activeWorkspace'
export const TAB_WORKSPACE_KEY = 'blueberry:tabWorkspace'

function defaults(): Space[] {
  return DEFAULT_SPACES.map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, tabIds: [] }))
}

export async function getWorkspaces(): Promise<Space[]> {
  try {
    const data = await browser.storage.local.get(WORKSPACE_KEY)
    const stored = data[WORKSPACE_KEY] as Space[] | undefined
    if (Array.isArray(stored) && stored.length > 0) return stored
  } catch {
    // fall through to defaults
  }
  return defaults()
}

export async function saveWorkspaces(spaces: Space[]): Promise<void> {
  await browser.storage.local.set({ [WORKSPACE_KEY]: spaces })
}

export async function getActiveWorkspaceId(): Promise<string> {
  try {
    const data = await browser.storage.local.get(ACTIVE_WORKSPACE_KEY)
    const id = data[ACTIVE_WORKSPACE_KEY] as string | undefined
    if (id) return id
  } catch {
    // fall through
  }
  return defaults()[0]!.id
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  await browser.storage.local.set({ [ACTIVE_WORKSPACE_KEY]: id })
}

export async function getTabMap(): Promise<Record<string, string>> {
  try {
    const data = await browser.storage.local.get(TAB_WORKSPACE_KEY)
    const m = data[TAB_WORKSPACE_KEY] as Record<string, string> | undefined
    if (m && typeof m === 'object') return m
  } catch {
    // fall through
  }
  return {}
}

async function saveTabMap(m: Record<string, string>): Promise<void> {
  await browser.storage.local.set({ [TAB_WORKSPACE_KEY]: m })
}

export async function assignTab(tabId: number | string, workspaceId: string): Promise<void> {
  const m = await getTabMap()
  m[String(tabId)] = workspaceId
  await saveTabMap(m)
}

export async function unassignTab(tabId: number | string): Promise<void> {
  const m = await getTabMap()
  delete m[String(tabId)]
  await saveTabMap(m)
}

export async function getTabWorkspace(tabId: number | string, fallback: string): Promise<string> {
  const m = await getTabMap()
  return m[String(tabId)] ?? fallback
}

/** Tabs belonging to a workspace (by stored mapping). */
export async function tabsInWorkspace(workspaceId: string): Promise<number[]> {
  const m = await getTabMap()
  return Object.entries(m)
    .filter(([, ws]) => ws === workspaceId)
    .map(([tabId]) => Number(tabId))
    .filter((n) => Number.isFinite(n))
}

/**
 * Switch workspace: set active, hide other workspaces' tabs / show ours
 * when tabs.hide is available; never throws (sidebar filtering always works).
 */
export async function applyWorkspace(workspaceId: string): Promise<{ hidden: number; shown: number; tabHide: boolean }> {
  await setActiveWorkspaceId(workspaceId)
  let hidden = 0
  let shown = 0
  let tabHide = true
  try {
    const tabs = await browser.tabs.query({ currentWindow: true })
    const mine = new Set(await tabsInWorkspace(workspaceId))
    // Unmapped tabs belong to the active workspace (adopt them)
    const tabMap = await getTabMap()
    let adopted = false
    for (const t of tabs) {
      if (t.id === undefined) continue
      if (!(String(t.id) in tabMap)) {
        tabMap[String(t.id)] = workspaceId
        mine.add(t.id)
        adopted = true
      }
    }
    if (adopted) await saveTabMap(tabMap)
    const hideIds: number[] = []
    const showIds: number[] = []
    for (const t of tabs) {
      if (t.id === undefined) continue
      if (mine.has(t.id)) {
        if (t.hidden) showIds.push(t.id)
      } else if (!t.hidden && !t.pinned) {
        hideIds.push(t.id)
      }
    }
    const tabsApi = browser.tabs as unknown as {
      hide?: (ids: number[]) => Promise<void>
      show?: (ids: number[]) => Promise<void>
    }
    if (typeof tabsApi.hide !== 'function' || typeof tabsApi.show !== 'function') {
      return { hidden: 0, shown: 0, tabHide: false }
    }
    if (hideIds.length > 0) {
      await tabsApi.hide(hideIds)
      hidden = hideIds.length
    }
    if (showIds.length > 0) {
      await tabsApi.show(showIds)
      shown = showIds.length
    }
  } catch {
    tabHide = false
  }
  return { hidden, shown, tabHide }
}

export async function createWorkspace(name: string, color?: string, icon?: string): Promise<Space> {
  const spaces = await getWorkspaces()
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']
  const ws: Space = {
    id: `space-${Date.now().toString(36)}`,
    name: name.slice(0, 24) || 'Untitled',
    color: color ?? palette[spaces.length % palette.length]!,
    icon: icon ?? '◍',
    tabIds: []
  }
  spaces.push(ws)
  await saveWorkspaces(spaces)
  return ws
}
