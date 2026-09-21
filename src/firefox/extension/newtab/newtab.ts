/**
 * Blueberry New Tab — Premium
 * Shows time, search, quick links, AI bar. Replaces Firefox newtab via chrome_url_overrides.
 */

function $(s: string) { return document.querySelector(s) as HTMLElement }

function init() {
  const root = document.getElementById('root')!
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  root.innerHTML = `
    <div style="height:48px; display:flex; align-items:center; justify-content:space-between; padding:0 20px; border-bottom:1px solid rgba(39,39,42,0.5); background:rgba(9,9,11,0.6); backdrop-filter:blur(16px);">
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="bg-blueberry" style="width:28px; height:28px; border-radius:9px; display:grid; place-items:center; color:#fff; font-weight:800; box-shadow:0 4px 12px rgba(99,102,241,0.35);">◐</div>
        <span style="font-weight:800; letter-spacing:-0.02em; font-size:13px;">Blueberry</span>
        <span style="font-size:11px; padding:3px 7px; border-radius:999px; background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.2); color:#a5b4fc; font-weight:700;">GECKO • BETA</span>
      </div>
      <div style="font-size:12px; color:#71717a; display:flex; align-items:center; gap:8px;">
        <span style="width:6px; height:6px; border-radius:999px; background:#10b981; box-shadow:0 0 0 4px rgba(16,185,129,0.15);"></span>
        ${time} • ${greeting}
      </div>
    </div>
    <div class="center">
      <div class="card">
        <div style="padding:28px 28px 20px; text-align:center;">
          <div class="bg-blueberry" style="width:56px; height:56px; border-radius:16px; display:grid; place-items:center; color:#fff; font-size:24px; font-weight:900; margin:0 auto 14px; box-shadow:0 10px 20px rgba(99,102,241,0.35); border:1px solid rgba(255,255,255,0.12);">◐</div>
          <h1 style="margin:0; font-size:28px; font-weight:900; letter-spacing:-0.03em; line-height:1;">Welcome to <span style="background:linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Blueberry</span></h1>
          <p style="margin:8px 0 0; font-size:13.5px; color:#71717a; font-weight:500;">AI-native browser on Gecko — insanely fast, private, beautiful.</p>
        </div>
        <div style="padding:0 20px 16px;">
          <form id="search" class="pill">
            <span style="width:28px; height:28px; border-radius:999px; background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.2); display:grid; place-items:center; color:#6366f1; flex-shrink:0;">⌘</span>
            <input id="q" placeholder="Search or ask Blueberry — try ‘Summarize this tab’" style="flex:1; background:transparent; border:none; outline:none; color:#fafafa; font-size:14px; font-weight:500;" autocomplete="off" />
            <span style="font-size:11px; font-weight:700; padding:4px 8px; border-radius:8px; background:#27272a; border:1px solid #3f3f46; color:#a1a1aa;">↵</span>
          </form>
          <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap; justify-content:center;">
            ${['Summarize', 'Extract tables', 'Find pricing', 'Clean view'].map(t => `<button class="pill" data-qa="${t}" style="padding:6px 10px; font-size:12px; font-weight:600; color:#d4d4d8; cursor:pointer;">✦ ${t}</button>`).join('')}
          </div>
        </div>
        <div style="padding:16px 20px; border-top:1px solid rgba(39,39,42,0.6); background:rgba(9,9,11,0.4);">
          <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; color:#71717a; margin-bottom:10px; display:flex; align-items:center; gap:8px;"><span style="width:12px; height:1px; background:#3f3f46;"></span> QUICK LINKS</div>
          <div class="quick">
            ${[
              { n: 'Google', u: 'https://google.com', c: '#4285f4' },
              { n: 'GitHub', u: 'https://github.com', c: '#18181b' },
              { n: 'Hugging Face', u: 'https://huggingface.co', c: '#ff9d00' },
              { n: 'ArXiv', u: 'https://arxiv.org', c: '#b31b1b' },
              { n: 'YouTube', u: 'https://youtube.com', c: '#ff0000' },
              { n: 'Wikipedia', u: 'https://wikipedia.org', c: '#636466' },
              { n: 'Stack Overflow', u: 'https://stackoverflow.com', c: '#f48024' },
              { n: 'Blueberry Docs', u: 'https://github.com/aceyTwenty1/blueberry', c: '#6366f1' },
            ].map(l => `
              <a href="${l.u}" style="display:flex; align-items:center; gap:10px; padding:10px; border-radius:12px; background:#18181b; border:1px solid #27272a; text-decoration:none; color:#d4d4d8; transition:all 0.15s;" class="qa-link">
                <span style="width:28px; height:28px; border-radius:8px; background:${l.c}; display:grid; place-items:center; color:#fff; font-weight:800; font-size:12px;">${l.n[0]}</span>
                <span style="font-size:12px; font-weight:600;">${l.n}</span>
              </a>
            `).join('')}
          </div>
        </div>
        <div style="padding:12px 20px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid rgba(39,39,42,0.6); font-size:11px; color:#52525b;">
          <span>Press <b style="color:#71717a;">Ctrl ⇧ K</b> for command palette • <b style="color:#71717a;">Ctrl ⇧ E</b> for AI sidebar</span>
          <span style="display:flex; align-items:center; gap:6px;"><span style="width:6px; height:6px; border-radius:999px; background:#10b981;"></span> Gecko • Private</span>
        </div>
      </div>
      <div style="margin-top:14px; font-size:11px; color:#52525b; text-align:center;">Blueberry 0.1.0 • MPL-2.0 • Made for the open web</div>
    </div>
  `

  const form = document.getElementById('search') as HTMLFormElement
  const input = document.getElementById('q') as HTMLInputElement
  form.addEventListener('submit', e => {
    e.preventDefault()
    const q = input.value.trim()
    if (!q) return
    // If looks like question, ask AI sidebar; else search
    if (q.toLowerCase().startsWith('summarize') || q.includes('?')) {

      browser.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action: 'custom', query: q } })

      browser.sidebarAction.open().catch(() => {})
    } else if (q.includes('.') && !q.includes(' ')) {
      location.href = q.startsWith('http') ? q : `https://${q}`
    } else {
      location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`
    }
  })
  document.querySelectorAll('[data-qa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qa = (btn as HTMLElement).getAttribute('data-qa')!

      browser.runtime.sendMessage({ type: 'BLUEBERRY_QUICK_ACTION', payload: { action: qa.toLowerCase().replace(' ', '-') } })

      browser.sidebarAction.open().catch(() => {})
    })
  })
  setTimeout(() => input.focus(), 100)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
