// browser is global — @types/firefox-webext-browser

document.getElementById('openSidebar')?.addEventListener('click', () => {
  browser.sidebarAction.open().catch(() => window.close())
  window.close()
})

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.getAttribute('data-action')
    if (action === 'summarize') void browser.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action: 'summarize' } })
    if (action === 'extract') void browser.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action: 'extract-tables' } })
    if (action === 'pricing') void browser.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action: 'pricing' } })
    if (action === 'vertical') {
      browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const id = tabs[0]?.id
          if (id) return browser.tabs.executeScript(id, { code: `document.documentElement.classList.toggle('blueberry-vertical-tabs')` })
        })
        .catch(() => {})
    }
    window.close()
  })
})

document.getElementById('openSettings')?.addEventListener('click', () => {
  void browser.runtime.openOptionsPage?.().catch(() => window.close())
  window.close()
})
