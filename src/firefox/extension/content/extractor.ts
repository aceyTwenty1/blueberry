/**
 * Blueberry Content Script — Page Context Extractor (Gecko)
 * Replaces Electron viewManager.extractMarkdown + src/ai/scraper/extractor.ts for DOM context.
 * Injected at document_idle on <all_urls>. Converts page to clean markdown-ish text, capped for LLM tokens.
 * Communicates via runtime.onMessage with background/sidebar.
 */

export interface ExtractedPage {
  url: string
  title: string
  markdown: string
  excerpt: string
  wordCount: number
}

/**
 * Token-optimized extraction — Step 3 will swap with full Cheerio/Turndown + readability.
 * Current: prefers <article>, strips hidden, collapses whitespace, caps 8k chars.
 */
export function extractFromDocument(doc: Document = document): ExtractedPage {
  const url = location.href
  const title = doc.title || 'Untitled'

  // Prefer readable container
  const article = doc.querySelector('article')
  const root = (article as HTMLElement) ?? doc.body

  // Clone to avoid mutating live DOM
  const clone = root.cloneNode(true) as HTMLElement

  // Strip noise
  clone.querySelectorAll('script, style, noscript, iframe, nav, footer, [aria-hidden="true"]').forEach((el) => el.remove())
  // Remove hidden
  clone.querySelectorAll<HTMLElement>('[hidden], [style*="display: none"]').forEach((el) => el.remove())

  let text = (clone.innerText || clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    // collapse 3+ newlines
    .replace(/\n{3,}/g, '\n\n')
    // collapse spaces
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  if (text.length > 8000) text = text.slice(0, 8000) + '\n\n[truncated for token limit]'

  const excerpt = text.slice(0, 400)
  const wordCount = text.split(/\s+/).filter(Boolean).length

  return { url, title, markdown: text, excerpt, wordCount }
}

export function buildPromptContext(page: ExtractedPage): string {
  return `# Page: ${page.title}\nURL: ${page.url}\n\n${page.markdown}`
}

// Listen for background requests — browser global typed via @types/firefox-webext-browser

try {
  browser.runtime.onMessage.addListener(async (msg: unknown) => {
    const m = msg as { type?: string }
    if (m.type === 'BLUEBERRY_EXTRACT_REQUEST') {
      return extractFromDocument()
    }
    return undefined
  })
} catch {
  // Fallback for non-extension test context
}

// Also expose for palette injection
;(window as unknown as { __blueberryExtractor: typeof extractFromDocument }).__blueberryExtractor = extractFromDocument

// Auto-extract on load for sidebar prefetch (optional, debounced)
let lastExtraction: ExtractedPage | null = null
function debouncedExtract() {
  lastExtraction = extractFromDocument()
  // Could post to background via runtime.sendMessage if needed
}

if (document.readyState === 'complete') debouncedExtract()
else window.addEventListener('load', debouncedExtract, { once: true })
