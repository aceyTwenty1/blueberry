/**
 * Preload — exposes a safe, typed API to renderer via contextBridge.
 * No direct Node access in renderer; all privileged ops go through ipcRenderer.invoke
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcInvokeMap, IpcOnMap } from '@shared/types/ipc'

type InvokeChannel = keyof IpcInvokeMap
type OnChannel = keyof IpcOnMap

const api = {
  // Generic typed invoke (renderer calls: window.api.invoke('tabs:list'))
  invoke<K extends InvokeChannel>(
    channel: K,
    ...args: Parameters<IpcInvokeMap[K]>
  ): ReturnType<IpcInvokeMap[K]> extends Promise<unknown>
    ? ReturnType<IpcInvokeMap[K]>
    : Promise<ReturnType<IpcInvokeMap[K]>> {
    return ipcRenderer.invoke(channel, ...args) as ReturnType<IpcInvokeMap[K]> extends Promise<unknown>
      ? ReturnType<IpcInvokeMap[K]>
      : Promise<ReturnType<IpcInvokeMap[K]>>
  },

  // Event subscription (main -> renderer pushes)
  on<K extends OnChannel>(channel: K, callback: IpcOnMap[K]): () => void {
    const listener = (_event: unknown, ...args: Parameters<IpcOnMap[K]>) => {
      // @ts-expect-error spread typing
      callback(...args)
    }
    ipcRenderer.on(channel as string, listener as never)
    return () => ipcRenderer.removeListener(channel as string, listener as never)
  },

  off<K extends OnChannel>(channel: K, callback: IpcOnMap[K]): void {
    ipcRenderer.removeListener(channel as string, callback as never)
  },

  // Convenience wrappers (ergonomic, fully typed)
  tabs: {
    create: (opts: Parameters<IpcInvokeMap['tabs:create']>[0]) =>
      ipcRenderer.invoke('tabs:create', opts) as unknown as Promise<ReturnType<IpcInvokeMap['tabs:create']>>,
    close: (id: string) => ipcRenderer.invoke('tabs:close', id),
    activate: (id: string) => ipcRenderer.invoke('tabs:activate', id),
    list: () => ipcRenderer.invoke('tabs:list') as unknown as Promise<ReturnType<IpcInvokeMap['tabs:list']>>,
    navigate: (payload: Parameters<IpcInvokeMap['tabs:navigate']>[0]) =>
      ipcRenderer.invoke('tabs:navigate', payload),
    navigation: (payload: Parameters<IpcInvokeMap['tabs:navigation']>[0]) =>
      ipcRenderer.invoke('tabs:navigation', payload)
  },

  browser: {
    getState: () => ipcRenderer.invoke('browser:getState') as unknown as Promise<ReturnType<IpcInvokeMap['browser:getState']>>,
    extractMarkdown: (tabId: string) =>
      ipcRenderer.invoke('browser:extractMarkdown', tabId) as unknown as Promise<ReturnType<IpcInvokeMap['browser:extractMarkdown']>>
  },

  ai: {
    listProviders: () => ipcRenderer.invoke('ai:listProviders') as unknown as Promise<ReturnType<IpcInvokeMap['ai:listProviders']>>,
    getProvider: (id: string) =>
      ipcRenderer.invoke('ai:getProvider', id) as unknown as Promise<ReturnType<IpcInvokeMap['ai:getProvider']>>,
    setProvider: (cfg: Parameters<IpcInvokeMap['ai:setProvider']>[0]) =>
      ipcRenderer.invoke('ai:setProvider', cfg),
    chat: (req: Parameters<IpcInvokeMap['ai:chat']>[0]) =>
      ipcRenderer.invoke('ai:chat', req) as unknown as Promise<ReturnType<IpcInvokeMap['ai:chat']>>,
    chatStream: (req: Parameters<IpcInvokeMap['ai:chatStream']>[0]) =>
      ipcRenderer.invoke('ai:chatStream', req),
    agentRun: (req: Parameters<IpcInvokeMap['ai:agentRun']>[0]) =>
      ipcRenderer.invoke('ai:agentRun', req) as unknown as Promise<ReturnType<IpcInvokeMap['ai:agentRun']>>,
    getComposio: () =>
      ipcRenderer.invoke('ai:getComposio') as unknown as Promise<ReturnType<IpcInvokeMap['ai:getComposio']>>,
    setComposio: (cfg: Parameters<IpcInvokeMap['ai:setComposio']>[0]) =>
      ipcRenderer.invoke('ai:setComposio', cfg)
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion') as unknown as Promise<ReturnType<IpcInvokeMap['app:getVersion']>>
  }
}

contextBridge.exposeInMainWorld('api', api)

// Also expose for Electron's contextIsolation check
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform
})
