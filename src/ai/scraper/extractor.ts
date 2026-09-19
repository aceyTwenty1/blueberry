/**
 * Page Context Extractor — Step 1 stub.
 * Step 3 replaces this with full Cheerio/Puppeteer markdown conversion, token-optimized.
 */

export interface ExtractedPage {
  url: string
  title: string
  markdown: string
  excerpt: string
  wordCount: number
}

/**
 * Lightweight extraction from raw HTML string (used in tests or future Puppeteer scraping).
 * Strips scripts/styles, collapses whitespace, caps length.
 */
export function extractMarkdownFromHtml(html: string, url: string, title = ''): ExtractedPage {
  // naive strip — Step 3 will use Cheerio + Turndown
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)

  const excerpt = text.slice(0, 400)
  const wordCount = text.split(/\s+/).filter(Boolean).length

  return { url, title, markdown: text, excerpt, wordCount }
}

export function buildPageContextPrompt(page: ExtractedPage): string {
  return `# Page: ${page.title}\nURL: ${page.url}\n\n${page.markdown}`
}

export const SYSTEM_PROMPTS = {
  summarize: 'You are Blueberry AI, an expert web summarizer. Produce concise bullet points, preserve key facts, numbers, and links. Use markdown.',
  qa: 'You are Blueberry AI. Answer questions grounded in the provided page context. Cite snippets when possible. If not in context, say so.',
  extract: 'You are Blueberry AI. Extract structured data as requested, return valid JSON or markdown tables.',
  general: 'You are Blueberry AI, a helpful in-browser co-pilot. Be concise, friendly, and web-aware.'
} as const
