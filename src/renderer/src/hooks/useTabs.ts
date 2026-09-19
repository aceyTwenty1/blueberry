import { useEffect, useState, useCallback } from 'react'
import type { Tab, TabId } from '@shared/types/tab'

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<TabId | null>(null)

  const refresh = useCallback(async () => {
    try {
      const state = await window.api.browser.getState()
      setTabs(state.tabs)
      setActiveTabId(state.activeTabId)
    } catch (e) {
      console.error('[useTabs] getState failed', e)
    }
  }, [])

  useEffect(() => {
    void refresh()

    const offChanged = window.api.on('tabs:changed', (payload: { tabs: Tab[]; activeTabId: TabId | null }) => {
      setTabs(payload.tabs)
      setActiveTabId(payload.activeTabId)
    })

    const offUpdated = window.api.on('tabs:updated', (payload: { id: string; title?: string; url?: string }) => {
      setTabs((prev) => prev.map((t) => (t.id === payload.id ? { ...t, ...payload } : t)))
    })

    return () => {
      offChanged()
      offUpdated()
    }
  }, [refresh])

  const createTab = useCallback(async (url?: string) => window.api.tabs.create({ url }), [])
  const closeTab = useCallback(async (id: TabId) => window.api.tabs.close(id), [])
  const activateTab = useCallback(async (id: TabId) => window.api.tabs.activate(id), [])
  const navigate = useCallback(async (id: TabId, url: string) => window.api.tabs.navigate({ id, url }), [])
  const go = useCallback(async (id: TabId, action: 'back' | 'forward' | 'reload' | 'stop') =>
    window.api.tabs.navigation({ id, action }), [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  return { tabs, activeTab, activeTabId, createTab, closeTab, activateTab, navigate, go, refresh }
}
