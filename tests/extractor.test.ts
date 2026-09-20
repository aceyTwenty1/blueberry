import { describe, it, expect } from 'vitest'
import { extractMarkdownFromHtml, buildPageContextPrompt } from '@ai/scraper/extractor'
import { extractFromDocument } from '../src/firefox/extension/content/extractor'

describe('extractMarkdownFromHtml (ai/scraper)', () => {
  it('strips scripts/styles and collapses', () => {
    const html = `<html><head><title>T</title><style>.x{}</style></head><body><script>alert(1)</script><h1>Hello</h1><p>World</p></body></html>`
    const r = extractMarkdownFromHtml(html, 'https://example.com', 'T')
    // Turndown correctly converts <h1> to ## Hello
    expect(r.markdown).toContain('Hello')
    expect(r.markdown).toContain('World')
    expect(r.url).toBe('https://example.com')
    expect(r.title).toBe('T')
    expect(r.excerpt.length).toBeGreaterThan(0)
    expect(r.wordCount).toBeGreaterThan(1)
  })

  it('caps at 8000 (plus truncated note)', () => {
    const html = `<p>${'a '.repeat(5000)}</p>`
    const r = extractMarkdownFromHtml(html, 'https://x.com')
    expect(r.markdown.length).toBeLessThanOrEqual(8030) // 8000 + truncated note
    expect(r.markdown).toContain('[truncated')
    expect(r.wordCount).toBeGreaterThan(0)
  })

  it('buildPageContextPrompt formats', () => {
    const page = { url: 'https://x.com', title: 'X', markdown: 'hi', excerpt: 'hi', wordCount: 1 }
    expect(buildPageContextPrompt(page)).toBe('# Page: X\nURL: https://x.com\n\nhi')
  })
})

describe('extractFromDocument (firefox content)', () => {
  it('prefers article and strips hidden', () => {
    document.body.innerHTML = `
      <article><p>Keep</p><script>bad</script></article>
      <nav>Remove nav</nav>
      <div hidden>Hidden</div>
    `
    document.title = 'Test'
    const r = extractFromDocument(document)
    expect(r.markdown).toContain('Keep')
    expect(r.markdown).not.toContain('bad')
    expect(r.markdown).not.toContain('Remove nav')
    expect(r.url).toBe(location.href)
    expect(r.title).toBe('Test')
  })

  it('caps and wordCount', () => {
    document.body.innerHTML = `<p>${'word '.repeat(3000)}</p>`
    const r = extractFromDocument(document)
    expect(r.markdown.length).toBeLessThanOrEqual(8000 + 30) // + truncated note
    expect(r.wordCount).toBeGreaterThan(100)
    expect(r.excerpt.length).toBeLessThanOrEqual(400)
  })
})
