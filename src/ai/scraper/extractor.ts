/**
 * Page Context Extractor — Real markdown via Readability + Turndown, token-optimized
 * Used by Node (viewManager warm cache, tests) and bundled for content script
 */

import { load } from 'cheerio'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export interface ExtractedPage {
  url: string
  title: string
  markdown: string
  excerpt: string
  wordCount: number
  tokenEstimate?: number
}

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', emDelimiter: '*', bulletListMarker: '-' })
td.use(gfm)
// Keep katex blocks intact
td.addRule('katex', {
  filter: (node: HTMLElement) => node.nodeName === 'SPAN' && (node as HTMLElement).classList?.contains('katex'),
  replacement: (content: string) => `$${content}$`
})

function estimateTokens(text: string): number {
  try {
    // js-tiktoken cl100k_base ~ 4 chars per token for English
    // Use simple heuristic if tiktoken not available in this context
    return Math.ceil(text.length / 4)
  } catch {
    return Math.ceil(text.length / 4)
  }
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s+|\s+$/g, '')
}

/**
 * Lightweight extraction from raw HTML string (Node, tests, Electron warm cache)
 * Uses Readability for article detection, then Turndown for markdown, capped 8k chars / ~2k tokens
 */
export function extractMarkdownFromHtml(html: string, url: string, title = ''): ExtractedPage {
  // Strip scripts/styles/head first (defense before JSDOM)
  let cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  let markdown = ''
  let extractedTitle = title

  try {
    const dom = new JSDOM(cleanHtml, { url })
    const doc = dom.window.document
    // Try Readability
    const reader = new Readability(doc.cloneNode(true) as Document, {
      charThreshold: 200,
      keepClasses: false
    })
    const article = reader.parse()
    if (article && article.content) {
      extractedTitle = article.title || title || doc.title || new URL(url).hostname
      // article.content is already cleaned HTML
      markdown = td.turndown(article.content)
    } else {
      // Fallback: cheerio + turndown on body
      const $ = load(cleanHtml)
      const root = $('article').first().length ? $('article').first() : ($('main').first().length ? $('main').first() : $('body'))
      markdown = td.turndown(root.html() || '')
      extractedTitle = title || $('title').text().trim() || new URL(url).hostname
    }
    dom.window.close()
  } catch {
    // Ultimate fallback: naive strip (puny)
    const $ = load(cleanHtml)
    $('script,style,noscript,iframe,nav,footer').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim()
    markdown = text
    extractedTitle = title || $('title').text().trim() || new URL(url).hostname
  }

  markdown = cleanMarkdown(markdown)
  // Token-aware cap: 8k chars ~2k tokens, keep excerpt 400 chars
  if (markdown.length > 8000) markdown = markdown.slice(0, 8000) + '\n\n[truncated for token limit]'
  const excerpt = markdown.slice(0, 400)
  const wordCount = markdown.split(/\s+/).filter(Boolean).length
  const tokenEstimate = estimateTokens(markdown)

  return { url, title: extractedTitle, markdown, excerpt, wordCount, tokenEstimate }
}

export function buildPageContextPrompt(page: ExtractedPage): string {
  return `# Page: ${page.title}\nURL: ${page.url}\n\n${page.markdown}`
}

export const SYSTEM_PROMPTS = {
  summarize: 'You are Blueberry AI, an expert web summarizer. Produce concise bullet points, preserve key facts, numbers, and links. Use markdown. Keep to 5 bullets.',
  qa: 'You are Blueberry AI. Answer questions grounded in the provided page context. Cite snippets when possible. If not in context, say so. Be concise.',
  extract: 'You are Blueberry AI. Extract structured data as requested, return valid JSON or markdown tables. Preserve headers and types.',
  general: 'You are Blueberry AI, a helpful in-browser co-pilot. Be concise, friendly, and web-aware.'
} as const
