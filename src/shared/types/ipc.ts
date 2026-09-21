import type { Tab, TabId, Space, SpaceId, CreateTabOptions, TabUpdatePayload, NavigationAction } from './tab'
import type { AIProviderConfig, AIProviderId, ChatRequest, ChatChunk, PageContext } from './ai'
import type { AgentEvent, AgentRunRequest } from './agent'
import type { ComposioConfig } from './composio'

/**
 * IPC channel definitions — strict typing for contextBridge.
 * Each channel maps to (payload) => response for type-safe ipcRenderer.invoke
 */
export interface IpcInvokeMap {
  // Tabs
  'tabs:create': (opts: CreateTabOptions) => Tab
  'tabs:close': (id: TabId) => void
  'tabs:activate': (id: TabId) => void
  'tabs:list': () => Tab[]
  'tabs:navigate': (payload: { id: TabId; url: string }) => void
  'tabs:navigation': (payload: { id: TabId; action: NavigationAction }) => void
  'tabs:update': (payload: TabUpdatePayload) => void

  // Spaces
  'spaces:list': () => Space[]
  'spaces:create': (name: string) => Space
  'spaces:activate': (id: SpaceId) => void

  // Browser
  'browser:getState': () => { tabs: Tab[]; spaces: Space[]; activeTabId: TabId | null }
  'browser:extractMarkdown': (tabId: TabId) => PageContext

  // AI
  'ai:listProviders': () => AIProviderConfig[]
  'ai:getProvider': (id: AIProviderId) => AIProviderConfig | null
  'ai:setProvider': (config: AIProviderConfig) => void
  'ai:chat': (req: ChatRequest) => string // non-stream fallback
  'ai:chatStream': (req: ChatRequest) => void // stream via events
  'ai:agentRun': (req: AgentRunRequest) => { ok: boolean; answer: string } // streams AgentEvent via ai:agentEvent
  'ai:getComposio': () => ComposioConfig
  'ai:setComposio': (config: ComposioConfig) => void

  // App
  'app:getVersion': () => string
}

export interface IpcOnMap {
  'tabs:changed': (payload: { tabs: Tab[]; activeTabId: TabId | null }) => void
  'tabs:updated': (payload: TabUpdatePayload) => void
  'ai:chunk': (chunk: ChatChunk) => void
  'ai:error': (error: string) => void
  'ai:agentEvent': (event: AgentEvent) => void
}

export type IpcInvokeChannel = keyof IpcInvokeMap
export type IpcOnChannel = keyof IpcOnMap
