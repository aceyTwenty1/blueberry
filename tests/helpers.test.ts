import { describe, it, expect } from 'vitest'
import { isValidUrl, normalizeUrl, extractDomain, generateId, cn } from '@shared/utils/helpers'

describe('helpers', () => {
  describe('isValidUrl', () => {
    it('accepts http/https', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
      expect(isValidUrl('http://localhost:11435/health')).toBe(true)
    })
    it('rejects non-http', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false)
      expect(isValidUrl('not a url')).toBe(false)
      expect(isValidUrl('blueberry://newtab')).toBe(false)
    })
  })

  describe('normalizeUrl', () => {
    it('returns https for bare domains', () => {
      expect(normalizeUrl('example.com')).toBe('https://example.com')
      expect(normalizeUrl('www.google.com')).toBe('https://www.google.com')
    })
    it('preserves blueberry://', () => {
      expect(normalizeUrl('blueberry://newtab')).toBe('blueberry://newtab')
    })
    it('turns search queries into google search', () => {
      expect(normalizeUrl('hello world')).toBe('https://www.google.com/search?q=hello%20world')
      expect(normalizeUrl('what is blueberry')).toContain('google.com/search')
    })
    it('keeps valid urls', () => {
      expect(normalizeUrl('https://huggingface.co')).toBe('https://huggingface.co')
    })
  })

  describe('extractDomain', () => {
    it('strips www', () => {
      expect(extractDomain('https://www.google.com/search?q=test')).toBe('google.com')
      expect(extractDomain('https://huggingface.co/models')).toBe('huggingface.co')
    })
    it('falls back to input on invalid', () => {
      expect(extractDomain('not-a-url')).toBe('not-a-url')
    })
  })

  describe('generateId', () => {
    it('prefixes and uniquifies', () => {
      const a = generateId('tab')
      const b = generateId('tab')
      expect(a.startsWith('tab-')).toBe(true)
      expect(a).not.toBe(b)
    })
  })

  describe('cn', () => {
    it('joins truthy', () => {
      expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c')
    })
  })
})
