# 🫐 Blueberry — AI-Native Browser on **Firefox (Gecko)**

> Fully Firefox-native fork — Gecko engine + WebExtension system addon + Blueberry AI. No Chromium.

**Status:** Gecko migration complete — Electron legacy preserved under `src/main:1` / `src/preload:1` but primary build is Firefox.

![Gecko](https://img.shields.io/badge/Gecko-Firefox-FF7139) ![MV2](https://img.shields.io/badge/Manifest-V2-6366f1) ![TypeScript](https://img.shields.io/badge/TS-5.8-3178C6) ![MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-green)

---

## Why Fully Firefox?

- **Engine:** Gecko (MPL) — not Chromium/Blink. Privacy, user control, `userChrome.css`.
- **Architecture:** `mozilla-central` fork + **privileged system WebExtension** (`src/firefox/extension/manifest.json:1`) — not Electron `WebContentsView`.
- **Replaces Electron:** `src/main/index.ts:1` + `viewManager.ts:1` + `preload/index.ts:1` → `src/firefox/extension/background/background.ts:1` + `content/extractor.ts:1`.
- **Replaces Renderer chrome:** `BrowserShell.tsx:1` → Firefox `sidebar_action` (`sidebar/sidebar.ts:1`) + `browser_action` popup + `userChrome.css:1` vertical tabs.
- **AI stays:** `src/ai/*:1` + `src/shared/*:1` reused, now via Gecko `fetch` in background (`aiRouter.ts:1`) — Ollama/local + OpenAI/Anthropic/Gemini.

---

## Directory (Gecko)

```
Blueberry/
├── mozconfig                           # artifact build config for mozilla-central
├── src/
│   ├── ai/                             # reused — providers, vector, extractor
│   ├── shared/                         # Tab/AI/IPC types, constants, helpers
│   ├── firefox/
│   │   ├── extension/
│   │   │   ├── manifest.json           # MV2, gecko id, sidebar_action, commands
│   │   │   ├── background/
│   │   │   │   ├── background.ts       # tabs/spaces, storage.local, runtime router (replaces Electron main)
│   │   │   │   └── aiRouter.ts         # Gecko fetch router for ollama/openai/anthropic/gemini
│   │   │   ├── content/
│   │   │   │   ├── extractor.ts        # DOM → markdown (replaces viewManager.extractMarkdown)
│   │   │   │   └── palette.ts          # Cmd+Shift+K palette injection (replaces CommandPalette.tsx)
│   │   │   ├── sidebar/
│   │   │   │   ├── index.html
│   │   │   │   └── sidebar.ts          # React sidebar — AI co-pilot (replaces AISidebar.tsx)
│   │   │   └── popup/
│   │   │       ├── index.html
│   │   │       └── popup.ts
│   │   ├── distribution/
│   │   │   └── policies.json           # force-install system addon, prefs
│   │   ├── autoconfig/
│   │   │   └── blueberry.js            # pref("sidebar.verticalTabs", true) etc
│   │   ├── userChrome.css              # hides #TabsToolbar, styles urlbar
│   │   └── branding/configure.sh       # overlay to mozilla-central
│   └── legacy/ (Electron — deprecated) # src/main, src/preload, src/renderer
├── scripts/build-firefox-extension.mjs # esbuild → dist/firefox-extension
├── tsconfig.json / tsconfig.firefox.json / tsconfig.node.json / tsconfig.web.json
└── package.json
```

---

## Quick Start — Firefox Extension (no mozilla-central build needed)

**Prereq:** Firefox ≥109, Node ≥18.

```bash
npm install
npm run build:firefox:extension   # esbuild → dist/firefox-extension
npm run dev:firefox               # web-ext run — launches Firefox with temp addon
# or: npx web-ext run --source-dir dist/firefox-extension --target firefox-desktop
```

Load manually: `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox-extension/manifest.json`.

**Commands:** `Ctrl+Shift+E` toggle sidebar, `Ctrl+Shift+K` palette, context menu “Blueberry: Summarize page”.

**Storage:** Providers in `browser.storage.local` (`blueberry:providers`) — same shape as `DEFAULT_AI_PROVIDERS` in `src/shared/constants/defaults.ts:1`. Set keys via sidebar Settings (or `about:addons` → Preferences).

**Local Open-Source (puny laptop, like Humaize — no Ollama needed):**
```powershell
# 135M free, ~280MB download once then offline — Humaize-style (D:\Humaize\generator.py:104)
powershell -ExecutionPolicy Bypass -File scripts/start-sidecar.ps1
# or double-click scripts/start-sidecar.bat
# -> http://localhost:11435 (health: /health, chat: POST /api/chat)
```
`src/ai/local/server.py:1` reuses `D:\Humaize` `TextRewriter` + `apply_light_mode` (`config.py:127`) with **puny** caps `1000 chars / 32 tok / 1 thread / ~400MB`. Sidebar defaults to `Local SmolLM2-135M (Puny, Free)` (`aiRouter.ts:32` Ollama-compatible). For 360M change `--model HuggingFaceTB/SmolLM2-360M-Instruct` (700MB). See `src/ai/local/README.md:1`.

**Ollama local (if you have it):** `http://localhost:11434` — no key, set `baseUrl` in providers. Background `aiRouter.ts:1` fetches directly (needs `<all_urls>` permission).

---

## Full Fork Build (mozilla-central)

For branded `Blueberry` binary (like Floorp):

```bash
# 1. Get mozilla-central (hg)
hg clone https://hg.mozilla.org/mozilla-central
# or git: git clone https://github.com/mozilla/gecko-dev mozilla-central

# 2. Apply overlay
./src/firefox/branding/configure.sh ./mozilla-central

# 3. Use Blueberry mozconfig
export MOZCONFIG=$PWD/mozconfig
# or cp mozconfig mozilla-central/mozconfig

# 4. Bootstrap + build
cd mozilla-central
./mach bootstrap  # choose Artifact build for fast UI iteration
./mach build
./mach run        # launches Blueberry

# Package
./mach package
# → obj-blueberry/dist/blueberry-*.tar.bz2 / .exe / .dmg
```

`mozconfig:1` uses `ac_add_options --enable-artifact-build` for fast iteration; comment that line for full Gecko compile (2h, 50GB).

`distribution/policies.json:1` force-installs `blueberry@blueberry.browser` as system addon; `autoconfig/blueberry.js:1` + `userChrome.css:1` enable vertical tabs.

---

## AI Provider Routing (Gecko)

`src/firefox/extension/background/aiRouter.ts:1` — `chatGecko()` / `chatStreamGecko()`:

- **Ollama** `POST localhost:11434/api/chat` — NDJSON stream
- **OpenAI/DeepSeek** `POST /v1/chat/completions` — SSE `data:` chunks
- **Anthropic** `POST /v1/messages` — header `anthropic-version: 2023-06-01`
- **Gemini** `POST /v1beta/models/{model}:generateContent?key=`

Sidebar (`sidebar.ts:1`) sends `BLUEBERRY_CHAT` via `browser.runtime.sendMessage`; background fetches and streams back via `BLUEBERRY_CHUNK` messages (or non-stream fallback).

---

## Scripts

| Script | What |
|--------|------|
| `npm run dev:firefox` | build + `web-ext run` |
| `npm run build:firefox:extension` | `esbuild` TS → `dist/firefox-extension` |
| `npm run build:firefox` | extension + `web-ext build` → `dist/*.xpi` |
| `npm run lint:firefox` | `web-ext lint` |
| `npm run typecheck` | `tsc` for node/web/firefox |
| `npm run dev:electron` | legacy Electron (deprecated) |

---

## Migration Notes (Chromium → Gecko)

| Electron (old) | Firefox (new) |
|----------------|---------------|
| `src/main/index.ts:1` `BrowserWindow` | `manifest.json:1` `background.scripts` |
| `viewManager.ts:1` `WebContentsView` | `browser.tabs.*` + `tabs.hide` |
| `preload/index.ts:1` `contextBridge` | `browser.runtime.onMessage` |
| `menu.ts:1` `Menu` | `browser.contextMenus` + `browser.commands` |
| `store.ts:1` file `userData` | `browser.storage.local` |
| `AISidebar.tsx:1` (renderer) | `sidebar/sidebar.ts:1` (sidebar_action) |
| `CommandPalette.tsx:1` | `content/palette.ts:1` injection |
| `electron-builder.yml:1` | `web-ext build` + `mozilla-central mach package` |

---

## License

MPL-2.0 (Gecko) + MIT for Blueberry glue. See `LICENSE`.

**Run it:** `npm install && npm run build:firefox:extension && npx web-ext run --source-dir dist/firefox-extension`
