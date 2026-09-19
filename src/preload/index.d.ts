import type { IpcInvokeMap, IpcOnMap } from '@shared/types/ipc'

type InvokeChannel = keyof IpcInvokeMap
type OnChannel = keyof IpcOnMap

export interface ElectronAPI {
  invoke<K extends InvokeChannel>(channel: K, ...args: Parameters<IpcInvokeMap[K]>): Promise<ReturnType<IpcInvokeMap[K]>>
  on<K extends OnChannel>(channel: K, callback: IpcOnMap[K]): () => void
  off<K extends OnChannel>(channel: K, callback: IpcOnMap[K]): void
  tabs: {
    create: (opts: Parameters<IpcInvokeMap['tabs:create']>[0]) => Promise<ReturnType<IpcInvokeMap['tabs:create']>>
    close: (id: string) => Promise<void>
    activate: (id: string) => Promise<void>
    list: () => Promise<ReturnType<IpcInvokeMap['tabs:list']>>
    navigate: (payload: Parameters<IpcInvokeMap['tabs:navigate']>[0]) => Promise<void>
    navigation: (payload: Parameters<IpcInvokeMap['tabs:navigation']>[0]) => Promise<void>
  }
  browser: {
    getState: () => Promise<ReturnType<IpcInvokeMap['browser:getState']>>
    extractMarkdown: (tabId: string) => Promise<ReturnType<IpcInvokeMap['browser:extractMarkdown']>>
  }
  ai: {
    listProviders: () => Promise<ReturnType<IpcInvokeMap['ai:listProviders']>>
    getProvider: (id: string) => Promise<ReturnType<IpcInvokeMap['ai:getProvider']>>
    setProvider: (cfg: Parameters<IpcInvokeMap['ai:setProvider']>[0]) => Promise<void>
    chat: (req: Parameters<IpcInvokeMap['ai:chat']>[0]) => Promise<string>
    chatStream: (req: Parameters<IpcInvokeMap['ai:chatStream']>[0]) => Promise<void>
  }
  app: {
    getVersion: () => Promise<string>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
    electron: { platform: NodeJS.Platform }
  }
}
