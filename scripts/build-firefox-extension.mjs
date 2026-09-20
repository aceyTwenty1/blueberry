#!/usr/bin/env node
// Blueberry — Build Firefox Extension (Gecko) from TypeScript sources
// Bundles background/content/sidebar/popup → dist/firefox-extension (XPI-ready)

import { build } from 'esbuild'
import { copyFileSync, mkdirSync, cpSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

const outDir = 'dist/firefox-extension'

mkdirSync(outDir, { recursive: true })
mkdirSync(join(outDir, 'background'), { recursive: true })
mkdirSync(join(outDir, 'content'), { recursive: true })
mkdirSync(join(outDir, 'sidebar'), { recursive: true })
mkdirSync(join(outDir, 'popup'), { recursive: true })
mkdirSync(join(outDir, 'newtab'), { recursive: true })
mkdirSync(join(outDir, 'options'), { recursive: true })
mkdirSync(join(outDir, 'icons'), { recursive: true })

// Copy manifest + html + css
copyFileSync('src/firefox/extension/manifest.json', join(outDir, 'manifest.json'))
copyFileSync('src/firefox/extension/sidebar/index.html', join(outDir, 'sidebar/index.html'))
if (existsSync('src/firefox/extension/sidebar/sidebar.css')) copyFileSync('src/firefox/extension/sidebar/sidebar.css', join(outDir, 'sidebar/sidebar.css'))
copyFileSync('src/firefox/extension/popup/index.html', join(outDir, 'popup/index.html'))
if (existsSync('src/firefox/extension/newtab/index.html')) copyFileSync('src/firefox/extension/newtab/index.html', join(outDir, 'newtab/index.html'))
if (existsSync('src/firefox/extension/newtab/newtab.css')) copyFileSync('src/firefox/extension/newtab/newtab.css', join(outDir, 'newtab/newtab.css'))
if (existsSync('src/firefox/extension/options/index.html')) copyFileSync('src/firefox/extension/options/index.html', join(outDir, 'options/index.html'))
if (existsSync('src/firefox/extension/options/options.css')) copyFileSync('src/firefox/extension/options/options.css', join(outDir, 'options/options.css'))
for (const s of ['16','32','64','128']) {
  const src = `resources/icon-${s}.png`
  const fallback = 'resources/icon.png'
  if (existsSync(src)) copyFileSync(src, join(outDir, `icons/icon-${s}.png`))
  else if (existsSync(fallback)) copyFileSync(fallback, join(outDir, `icons/icon-${s}.png`))
}

// Bundle each entry with esbuild (keep browser.* globals)
const entries = [
  { in: 'src/firefox/extension/background/background.ts', out: 'background/background.js' },
  { in: 'src/firefox/extension/content/extractor.ts', out: 'content/extractor.js' },
  { in: 'src/firefox/extension/content/palette.ts', out: 'content/palette.js' },
  { in: 'src/firefox/extension/sidebar/sidebar.ts', out: 'sidebar/sidebar.js' },
  { in: 'src/firefox/extension/popup/popup.ts', out: 'popup/popup.js' },
  { in: 'src/firefox/extension/newtab/newtab.ts', out: 'newtab/newtab.js' },
  { in: 'src/firefox/extension/options/options.tsx', out: 'options/options.js' },
]

for (const e of entries) {
  await build({
    entryPoints: [e.in],
    bundle: true,
    outfile: join(outDir, e.out),
    platform: 'browser',
    target: 'firefox109',
    format: 'iife',
    external: [],
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@shared': './src/shared', '@ai': './src/ai' }
  })
  console.log(`[build] ${e.in} → ${e.out}`)
}

// Also bundle shared/ai as needed — background imports them, esbuild inlines
console.log(`[build] Firefox extension ready at ${outDir}/ — run: npx web-ext run --source-dir ${outDir}`)
