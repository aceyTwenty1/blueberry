/**
 * Blueberry Command Palette — Premium Raycast/Linear style for Gecko
 * Injected via browser.tabs.executeScript on Ctrl+Shift+K. Vanilla DOM for speed, no React in content.
 */

let paletteEl: HTMLElement | null = null
let selectedIdx = 0

function closePalette() {
  if (!paletteEl) return
  paletteEl.style.opacity = '0'
  paletteEl.style.transform = 'scale(0.98)'
  setTimeout(() => {
    paletteEl?.remove()
    paletteEl = null
    selectedIdx = 0
    document.removeEventListener('keydown', escHandler)
    document.removeEventListener('keydown', navHandler)
  }, 120)
}

function escHandler(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); closePalette() }
}

function navHandler(e: KeyboardEvent) {
  if (!paletteEl) return
  const items = [...paletteEl.querySelectorAll<HTMLButtonElement>('[data-idx]')]
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, items.length - 1); updateSelection() }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); updateSelection() }
  if (e.key === 'Enter') { e.preventDefault(); items[selectedIdx]?.click() }
}

function updateSelection() {
  if (!paletteEl) return
  const items = [...paletteEl.querySelectorAll<HTMLButtonElement>('[data-idx]')]
  items.forEach((el, i) => {
    const isSel = i === selectedIdx
    el.style.background = isSel ? 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)' : 'transparent'
    el.style.borderColor = isSel ? 'rgba(99,102,241,0.25)' : 'transparent'
    el.style.transform = isSel ? 'translateX(2px)' : 'translateX(0)'
  })
  items[selectedIdx]?.scrollIntoView({ block: 'nearest' })
}

export function openPalette() {
  if (paletteEl) { closePalette(); return }
  paletteEl = document.createElement('div')
  paletteEl.id = 'blueberry-palette-root'
  paletteEl.style.cssText = `
    position:fixed; inset:0; z-index:2147483647;
    display:flex; align-items:flex-start; justify-content:center; padding-top:18vh;
    background: radial-gradient(800px 400px at 50% 0%, rgba(99,102,241,0.15), transparent 70%), rgba(0,0,0,0.72);
    backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%);
    font-family: Inter, system-ui, -apple-system, sans-serif;
    opacity:0; transform:scale(0.98); transition: opacity 0.16s ease, transform 0.16s ease;
  `

  // Card with gradient border
  const card = document.createElement('div')
  card.style.cssText = `
    width:640px; max-width:92vw;
    background: linear-gradient(#18181b, #18181b) padding-box, linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.35), rgba(236,72,153,0.25)) border-box;
    border:1px solid transparent; border-radius:20px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 1px 0 rgba(255,255,255,0.06) inset;
    overflow:hidden;
    animation: bbSlideIn 0.2s ease;
  `

  card.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      @keyframes bbSlideIn { from { opacity:0; transform: translateY(8px) scale(0.98); } to { opacity:1; transform: translateY(0) scale(1); } }
      @keyframes bbPulse { 0%,100% { opacity:1 } 50% { opacity:0.6 } }
      .bb-input::placeholder { color:#71717a; }
      .bb-item:hover { background: rgba(39,39,42,0.6) !important; }
    </style>
    <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid rgba(39,39,42,0.7); background: linear-gradient(180deg, rgba(39,39,42,0.3) 0%, transparent 100%);">
      <div style="width:36px; height:36px; border-radius:10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display:grid; place-items:center; color:#fff; font-weight:800; box-shadow:0 4px 12px rgba(99,102,241,0.35); flex-shrink:0;">⌘</div>
      <input id="bb-palette-input" placeholder="Ask Blueberry, run commands, or go to URL..." style="flex:1; background:transparent; border:none; outline:none; color:#fafafa; font-size:14.5px; font-weight:500; letter-spacing:-0.01em;" autocomplete="off" spellcheck="false" />
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <span style="font-size:11px; font-weight:600; padding:4px 7px; border-radius:7px; background:#27272a; border:1px solid #3f3f46; color:#a1a1aa; letter-spacing:0.04em;">ESC</span>
      </div>
    </div>
    <div style="max-height:380px; overflow:auto; padding:8px; background:#18181b;" id="bb-palette-list">
      <div style="padding:8px 10px 6px; font-size:11px; font-weight:700; letter-spacing:0.08em; color:#71717a; display:flex; align-items:center; gap:8px;"><span style="width:16px; height:1px; background:#3f3f46;"></span> AI ACTIONS <span style="margin-left:auto; font-weight:500; color:#52525b; letter-spacing:0;">4</span></div>
      <button data-idx="0" data-action="summarize" class="bb-item" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; border:1px solid transparent; background:transparent; color:#fafafa; cursor:pointer; transition: all 0.12s;">
        <div style="width:32px; height:32px; border-radius:9px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display:grid; place-items:center; color:#fff; font-size:14px; box-shadow:0 3px 8px rgba(99,102,241,0.3);">◐</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600; letter-spacing:-0.01em; line-height:1.2;">Summarize this page</div>
          <div style="font-size:12px; color:#71717a; line-height:1.2;">Beautiful bullets • Keep numbers & links</div>
        </div>
        <span style="font-size:11px; font-weight:600; padding:3px 7px; border-radius:6px; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.2); color:#a5b4fc;">AI</span>
        <span style="color:#52525b; font-size:12px;">↵</span>
      </button>
      <button data-idx="1" data-action="extract-tables" class="bb-item" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; border:1px solid transparent; background:transparent; color:#fafafa; cursor:pointer; transition: all 0.12s;">
        <div style="width:32px; height:32px; border-radius:9px; background: linear-gradient(135deg, #10b981, #06b6d4); display:grid; place-items:center; color:#fff; font-size:14px;">▦</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600;">Extract tables</div>
          <div style="font-size:12px; color:#71717a;">As clean markdown • Headers preserved</div>
        </div>
        <span style="font-size:11px; font-weight:600; padding:3px 7px; border-radius:6px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.18); color:#6ee7b7;">AI</span>
        <span style="color:#52525b;">↵</span>
      </button>
      <button data-idx="2" data-action="pricing" class="bb-item" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; border:1px solid transparent; background:transparent; color:#fafafa; cursor:pointer; transition: all 0.12s;">
        <div style="width:32px; height:32px; border-radius:9px; background: linear-gradient(135deg, #f59e0b, #f97316); display:grid; place-items:center; color:#fff;">◈</div>
        <div style="flex:1;"><div style="font-size:13px; font-weight:600;">Find pricing plans</div><div style="font-size:12px; color:#71717a;">Tiers • Comparisons • Gotchas</div></div>
        <span style="font-size:11px; font-weight:600; padding:3px 7px; border-radius:6px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.18); color:#fcd34d;">AI</span>
        <span style="color:#52525b;">↵</span>
      </button>
      <button data-idx="3" data-action="clean" class="bb-item" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; border:1px solid transparent; background:transparent; color:#fafafa; cursor:pointer; transition: all 0.12s;">
        <div style="width:32px; height:32px; border-radius:9px; background: linear-gradient(135deg, #ec4899, #8b5cf6); display:grid; place-items:center; color:#fff;">✦</div>
        <div style="flex:1;"><div style="font-size:13px; font-weight:600;">Clean view — Reader</div><div style="font-size:12px; color:#71717a;">Strip ads • Pure markdown</div></div>
        <span style="font-size:11px; font-weight:600; padding:3px 7px; border-radius:6px; background:rgba(236,72,153,0.12); border:1px solid rgba(236,72,153,0.18); color:#f9a8d4;">AI</span>
        <span style="color:#52525b;">↵</span>
      </button>
      <div style="height:1px; background:#27272a; margin:8px 0;"></div>
      <div style="padding:6px 10px; font-size:11px; font-weight:700; letter-spacing:0.08em; color:#71717a;">NAVIGATION</div>
      <button data-idx="4" data-action="newtab" class="bb-item" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; border:1px solid transparent; background:transparent; color:#fafafa; cursor:pointer;">
        <div style="width:32px; height:32px; border-radius:9px; background:#27272a; border:1px solid #3f3f46; display:grid; place-items:center; color:#a1a1aa;">◫</div>
        <div style="flex:1;"><div style="font-size:13px; font-weight:600;">New Tab</div><div style="font-size:12px; color:#71717a;">Open a fresh tab</div></div>
        <span style="font-size:11px; color:#52525b; border:1px solid #3f3f46; padding:2px 6px; border-radius:6px; background:#18181b;">⌘T</span>
      </button>
      <div id="bb-navigate-row" style="display:none;">
        <button data-idx="5" id="bb-navigate-btn" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; border:1px solid rgba(99,102,241,0.25); background:linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05)); color:#fafafa; cursor:pointer; margin-top:4px;">
          <div style="width:32px; height:32px; border-radius:9px; background:#27272a; display:grid; place-items:center; color:#a1a1aa;">↗</div>
          <div style="flex:1;"><div style="font-size:13px; font-weight:600;">Go to “<span id="bb-query"></span>”</div><div style="font-size:12px; color:#71717a;">Search or enter URL • ↵ to go</div></div>
        </button>
      </div>
    </div>
    <div style="padding:10px 14px; border-top:1px solid #27272a; display:flex; align-items:center; justify-content:space-between; background: linear-gradient(180deg, #18181b, #1f1f23);">
      <div style="display:flex; align-items:center; gap:8px; font-size:11px; color:#52525b;">
        <span style="width:14px; height:14px; border-radius:5px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display:grid; place-items:center; color:#fff; font-size:9px; font-weight:800;">✦</span>
        <span><b style="color:#71717a;">↑↓</b> navigate • <b style="color:#71717a;">↵</b> select • <b style="color:#71717a;">ESC</b> close</span>
      </div>
      <div style="font-size:11px; color:#52525b; display:flex; align-items:center; gap:6px;"><span style="width:6px; height:6px; border-radius:999px; background:#10b981; box-shadow:0 0 0 4px rgba(16,185,129,0.15); animation: bbPulse 1.5s infinite;"></span> Blueberry • Gecko</div>
    </div>
  `

  paletteEl.appendChild(card)
  document.body.appendChild(paletteEl)
  // Trigger animation
  requestAnimationFrame(() => { if (paletteEl) { paletteEl.style.opacity = '1'; paletteEl.style.transform = 'scale(1)' } })

  document.addEventListener('keydown', escHandler)
  document.addEventListener('keydown', navHandler)

  const input = card.querySelector<HTMLInputElement>('#bb-palette-input')!
  const navigateRow = card.querySelector<HTMLDivElement>('#bb-navigate-row')!
  const querySpan = card.querySelector<HTMLSpanElement>('#bb-query')!
  const navigateBtn = card.querySelector<HTMLButtonElement>('#bb-navigate-btn')!

  setTimeout(() => input.focus(), 30)

  // Click handling
  paletteEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === paletteEl) closePalette()
    const btn = target.closest('button[data-action]') as HTMLElement | null
    if (btn) {
      const action = btn.getAttribute('data-action')
      if (action === 'newtab') {
        // For Gecko, we ask background to create tab
        void (globalThis as unknown as { browser?: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } } }).browser?.runtime.sendMessage({ type: 'BLUEBERRY_NEW_TAB' })
      } else {
        void (globalThis as unknown as { browser?: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } } }).browser?.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action } })
      }
      closePalette()
    }
  })

  // Live filtering + navigate row
  const allItems = [...card.querySelectorAll<HTMLButtonElement>('[data-idx]')].slice(0, 4)
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    if (q.length > 1) {
      navigateRow.style.display = 'block'
      querySpan.textContent = input.value.trim()
      navigateBtn.setAttribute('data-idx', String(4))
      navigateBtn.onclick = () => {
        const url = input.value.trim()
        void (globalThis as unknown as { browser?: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } } }).browser?.runtime.sendMessage({ type: 'BLUEBERRY_NAVIGATE', payload: { url } })
        closePalette()
      }
    } else {
      navigateRow.style.display = 'none'
    }
    // Filter AI actions
    allItems.forEach(btn => {
      const text = btn.textContent?.toLowerCase() ?? ''
      btn.style.display = !q || text.includes(q) ? 'flex' : 'none'
    })
    selectedIdx = 0
    updateSelection()
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const visible = [...card.querySelectorAll<HTMLButtonElement>('[data-idx]')].filter(el => (el as HTMLElement).style.display !== 'none')
      const target = visible[selectedIdx] ?? visible[0]
      target?.click()
    }
  })

  updateSelection()
  // Close on backdrop click already handled
}

// Auto-open when injected
openPalette()
