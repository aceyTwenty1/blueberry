/** Tab & Space types - shared between main and renderer (isomorphic) */

export type TabId = string
export type SpaceId = string

export interface Tab {
  id: TabId
  url: string
  title: string
  favicon?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  spaceId: SpaceId
  createdAt: number
  lastActiveAt: number
}

export interface Space {
  id: SpaceId
  name: string
  color: string
  icon: string
  tabIds: TabId[]
}

export interface BrowserState {
  tabs: Record<TabId, Tab>
  spaces: Record<SpaceId, Space>
  activeTabId: TabId | null
  activeSpaceId: SpaceId | null
}

export type NavigationAction = 'back' | 'forward' | 'reload' | 'stop'

export interface CreateTabOptions {
  url?: string
  spaceId?: SpaceId
  active?: boolean
}

export interface TabUpdatePayload {
  id: TabId
  title?: string
  url?: string
  favicon?: string
  isLoading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
}
