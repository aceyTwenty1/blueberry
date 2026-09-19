# 🫐 Blueberry — Dual AI-Native Browser

> **Gecko (Firefox) + Chromium (Electron) — one codebase, two engines, one 135M puny local model.** No Ollama, no cloud required. Premium Arc/Linear/Raycast UI.

![Dual](https://img.shields.io/badge/dual-Gecko%20%2B%20Chromium-6366f1) ![Gecko](https://img.shields.io/badge/Gecko-Firefox-FF7139) ![Chromium](https://img.shields.io/badge/Chromium-Electron-47848F) ![HF](https://img.shields.io/badge/HF-SmolLM2--135M-FF9D00) ![TS](https://img.shields.io/badge/TS-5.8-3178C6) ![MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-green)

**Why dual?** Gecko for privacy/vertical tabs/`userChrome.css`; Chromium for Blink compatibility + `WebContentsView` isolation. Both share `src/ai/*` + `src/shared/*` + same premium design system.

---

## Architecture (deep)

```
Blueberry/
├── src/
│   ├── ai/  (shared)
│   │   ├── local/server.py          # Humaize-style TextRewriter (SmolLM2-135M puny, 1000c/64tok/1th ~400MB) → :11435
│   │   ├── providers/               # ollama/openai/anthropic/gemini (cloud)
│   │   ├── scraper/extractor.ts     # DOM → 8k markdown (Gecko content + Electron viewManager)
│   │   └── vector/lancedb.ts        # local RAG (future)
│   ├── shared/ (isomorphic)
│   │   ├── types/{ai,tab,ipc}.ts    # AIProviderId includes local-smollm135
│   │   ├── constants/defaults.ts    # DEFAULT_AI_PROVIDERS[0]=local-smollm135 :11435
│   │   └── utils/helpers.ts
│   ├── firefox/ (Gecko, MV2)
│   │   ├── extension/
│   │   │   ├── manifest.json        # MV2, gecko id, sidebar_action, chrome_url_overrides newtab
│   │   │   ├── background/{background.ts,aiRouter.ts}  # browser.* + fetch to :11435/:11434
│   │   │   ├── content/{extractor.ts,palette.ts}       # DOM extract + Raycast palette
│   │   │   ├── sidebar/{index.html,sidebar.css,sidebar.ts} # premium dark simple Menu+Chat
│   │   │   ├── popup/               # gradient header + 2x2 QA
│   │   │   └── newtab/              # Arc mesh, search, quick links (8)
│   │   ├── distribution/policies.json, autoconfig/blueberry.js, userChrome.css
│   │   └── branding/configure.sh → mozilla-central
│   ├── main/ (Chromium/Electron, Node)
│   │   ├── index.ts, windows/{createMainWindow.ts,viewManager.ts}, ipc/handlers.ts (fetch to :11435)
│   │   ├── preload/ (contextBridge)
│   │   └── renderer/ (React 19 + Tailwind, VerticalTabs/AddressBar/AISidebar/CommandPalette/BrowserShell)
│   └── legacy: none — both are first-class
├── scripts/
│   ├── build-firefox-extension.mjs  # esbuild → dist/firefox-extension
│   ├── build-real-browser.ps1       # repack C:\Program Files\Mozilla Firefox → dist/Blueberry-Browser (348MB)
│   ├── start-sidecar.{ps1,bat}      # .venv + torch+transformers + :11435
│   ├── start-blueberry.{bat,ps1}    # Gecko real browser + sidecar
│   ├── start-chromium.{bat,ps1}     # Chromium Electron + sidecar
│   └── start-dual.ps1               # menu: 1 Gecko 2 Chromium 3 Both (share :11435)
├── resources/icon-{16,32,64,128}.png + icon.ico (Pillow gradient ◐)
└── mozconfig (artifact build)
```

**AI routing (both engines):** `aiRouter.ts:32` (Gecko) and `src/main/ipc/handlers.ts:92` (Chromium) treat `local-smollm135` as Ollama-compatible `POST {baseUrl}/api/chat` NDJSON. Fallback to mock if sidecar not running. Cloud providers via same `fetch` (OpenAI SSE, Anthropic, Gemini).

**Design system:** Tailwind 4 + `zinc`/`blueberry`/`violet` + Inter/JetBrains Mono + `backdrop-blur 20px` + `shadow-blueberry` + `pulse-live`/`slide-in`/`dot-bounce`. Shared across Gecko (inline) + Chromium (Tailwind).

---

## Quick Start — Puny Laptop (no Ollama)

**First run (once):** downloads `HuggingFaceTB/SmolLM2-135M-Instruct` ~280MB → `HF cache` → offline forever. Reuses `D:\Humaize` `TextRewriter` if present (`src/ai/local/server.py:18`).

```powershell
# Terminal 1 — sidecar (keep open, window "Blueberry Sidecar")
powershell -ExecutionPolicy Bypass -File scripts/start-sidecar.ps1
# or: python src/ai/local/server.py --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny
# check: curl http://127.0.0.1:11435/health

# Terminal 2 — pick engine
# Gecko (Firefox) — extension temp
npm install; npm run build:firefox:extension; npm run dev:firefox
# Gecko — real installable browser (repack, no source build)
powershell -ExecutionPolicy Bypass -File scripts/build-real-browser.ps1
.\dist\Blueberry-Browser\Blueberry.bat        # or double-click start-blueberry.bat

# Chromium (Electron) — standalone, same agents
npm run dev:chromium          # or: npm run dev:electron
# or: start-chromium.bat  /  powershell -ExecutionPolicy Bypass -File scripts/start-chromium.ps1

# Both at once (share :11435)
powershell -ExecutionPolicy Bypass -File scripts/start-dual.ps1
```

**One-click startup (with sidecar):**
- `start-blueberry.bat` — Gecko real browser + sidecar (visible log to `blueberry-startup.log`)
- `start-chromium.bat` — Electron + sidecar
- Autostart on login: `powershell -ExecutionPolicy Bypass -File scripts/install-startup.ps1` → `shell:startup\Blueberry.lnk` + Task Scheduler. Remove: `-Remove`.

**Providers:** `src/shared/constants/defaults.ts:12` default `local-smollm135` enabled (`http://localhost:11435`). Sidebar header `Menu` → switch agent; provider dropdown in Chromium header. For 360M: `npm run sidecar:360` (700MB, ~1GB RAM).

---

## Use — Simple Strawberry Menu

**Sidebar (both engines, `sidebar/sidebar.ts:1`):** Header `Menu` button → 5 agents: `Blueberry` (general), `Summarizer` (5 bullets), `Extractor` (tables), `Pricing` (tiers), `Reader` (clean). Pick → type in pill `Talk to <Agent>...` → `Enter`. Current tab markdown auto-attached (`content/extractor.ts:1` 8k cap). Streaming via `BLUEBERRY_CHUNK` (Gecko) / `ai:chunk` (Electron).

**Palette:** `Ctrl+Shift+K` → Raycast `20px` card, `⌘` orb, `↑↓`/`↵`/`ESC`. Quick `Go to "query"`.

**Popup / New Tab:** Popup `2×2` QA + `Open AI Sidebar`; New Tab `newtab/newtab.ts:1` Arc mesh, search, 8 quick links (Google/GitHub/HF/ArXiv...), `chrome_url_overrides` in `manifest.json:62`.

**Right-click (Gecko only):** `Blueberry: Summarize / Extract tables / Ask`.

---

## Full Builds

```bash
# Gecko extension XPI
npm run build:firefox:extension  # dist/firefox-extension
npm run package:firefox          # dist/blueberry*.zip (XPI)

# Gecko real browser (repack, 348MB)
powershell -ExecutionPolicy Bypass -File scripts/build-real-browser.ps1
# → dist/Blueberry-Browser/{firefox.exe, distribution/extensions/*.xpi, Blueberry.bat, BlueberryProfile/}

# Gecko source fork (like Floorp)
hg clone https://hg.mozilla.org/mozilla-central; ./src/firefox/branding/configure.sh ./mozilla-central; MOZCONFIG=$PWD/mozconfig ./mach build

# Chromium standalone
npm run build:electron            # out/main + out/renderer (701kB JS + 39kB CSS)
npm run build:electron:win        # electron-builder → dist/*.exe / .zip
# or both:
npm run build:dual
```

**Icons:** `resources/icon-{16,32,64,128}.png` + `icon.ico` (Pillow gradient `6366f1→8b5cf6→ec4899` + ◐, 24KB ICO).

---

## Scripts

| Script | What |
|--------|------|
| `npm run dev:firefox` | Gecko temp addon |
| `npm run dev:chromium` (`dev:electron`) | Chromium Electron HMR |
| `npm run dev:dual` | Menu to pick Gecko/Chromium/both |
| `npm run build:firefox:extension` | esbuild Gecko |
| `npm run build:electron` | electron-vite Chromium |
| `npm run build:dual` | both |
| `npm run sidecar:135` / `:360` | 135M/360M puny sidecar |
| `scripts/build-real-browser.ps1` | Gecko real browser repack |
| `start-blueberry.bat` / `start-chromium.bat` | One-click + sidecar |
| `scripts/install-startup.ps1` | Autostart |
| `npm run typecheck` | tsc node/web/firefox |

---

## Troubleshooting

- **Sidebar not showing:** Close all Firefox/Blueberry, delete `dist/Blueberry-Browser/BlueberryProfile`, relaunch — `userChrome.css` reinstalls, `open_at_install` reopens. Or `Ctrl+Shift+E` / toolbar ◐.
- **Nothing happens on start:** Don’t double-click hidden `/min` — now `start-blueberry.bat` is visible and logs to `blueberry-startup.log`. Close all Firefox first (`-no-remote` blocks second instance, fallback tries `-new-instance`).
- **Sidecar not running:** `curl http://127.0.0.1:11435/health` should be `{"status":"ok"}`. First run downloads 280MB, next 30s silent. If `Error (local-smollm135)` in sidebar, run `scripts/start-sidecar.ps1`.

---

## License

MPL-2.0 (Gecko) + MIT for Blueberry glue.

**Run dual:** `npm install && npm run build:dual && powershell -ExecutionPolicy Bypass -File scripts/start-dual.ps1`
