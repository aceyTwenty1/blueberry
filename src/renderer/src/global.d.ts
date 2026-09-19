import type { ElectronAPI } from '../../preload/index.d.ts'

declare global {
  interface Window {
    api: ElectronAPI
    electron: { platform: NodeJS.Platform }
  }
}

export {}
