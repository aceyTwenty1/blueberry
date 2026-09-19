/**
 * Blueberry — Electron Main Process
 * Security: sandbox=true, contextIsolation=true, nodeIntegration=false.
 * Renderer communicates only via preload contextBridge (window.api).
 */
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './windows/createMainWindow'
import { ViewManager } from './windows/viewManager'
import { registerIpcHandlers } from './ipc/handlers'
import { buildAppMenu } from './menu'

let mainWindow: BrowserWindow | null = null
let viewManager: ViewManager | null = null

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.blueberry.browser')

  // Watch window shortcuts (lightweight replacement for @electron-toolkit/utils)
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && (input.control || input.meta) && input.key.toLowerCase() === 'r') {
        // allow reload only in dev
        if (!process.env['ELECTRON_RENDERER_URL']) event.preventDefault()
      }
    })
  })

  buildAppMenu()

  mainWindow = createMainWindow()

  // ViewManager needs to forward events to renderer via webContents
  viewManager = new ViewManager({
    onTabsChanged: (payload) => mainWindow?.webContents.send('tabs:changed', payload),
    onTabUpdated: (payload) => mainWindow?.webContents.send('tabs:updated', payload)
  })
  viewManager.attachWindow(mainWindow)

  registerIpcHandlers(viewManager)

  // Create initial tab after window ready
  mainWindow.once('ready-to-show', () => {
    viewManager?.createTab('https://www.google.com')
  })

  // Re-layout WebContentsView when window resizes or moves
  mainWindow.on('resize', () => viewManager?.layout())
  mainWindow.on('enter-html-full-screen', () => viewManager?.layout())
  mainWindow.on('leave-html-full-screen', () => viewManager?.layout())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
      viewManager?.attachWindow(mainWindow)
    }
  })
})

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Security: deny navigation outside WebContentsView; renderer chrome is file://
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    // Allow only file:// for chrome and http(s) for webviews (which are separate contents)
    const isChrome = contents === mainWindow?.webContents
    if (isChrome && !url.startsWith('file://') && !url.startsWith('http://localhost')) {
      // chrome shouldn't navigate externally; keep it internal
      if (!url.startsWith('devtools://')) event.preventDefault()
    }
  })
})
