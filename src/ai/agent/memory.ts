/**
 * Agent memory — puny-friendly scored keyword store (no embeddings, no native deps).
 * Shared core; per-engine runners handle persistence (storage.local / file).
 * Scoring: title match x3 + text term overlap + recency boost. Deterministic.
 */
import type { VectorDoc } from '../vector/lancedb'

export interface MemoryHit {
  doc: VectorDoc
  score: number
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

export class AgentMemory {
  private docs: VectorDoc[] = []

  async add(doc: Omit<VectorDoc, 'createdAt'>): Promise<void> {
    const idx = this.docs.findIndex((d) => d.id === doc.id)
    const full: VectorDoc = { ...doc, createdAt: Date.now() }
    if (idx >= 0) this.docs[idx] = full
    else this.docs.push(full)
    // cap to 200 docs (puny)
    if (this.docs.length > 200) this.docs = this.docs.slice(-200)
  }

  async recall(query: string, k = 3): Promise<MemoryHit[]> {
    const qterms = new Set(tokenize(query))
    if (qterms.size === 0) return []
    const now = Date.now()
    const scored: MemoryHit[] = this.docs.map((doc) => {
      const titleTerms = new Set(tokenize(doc.title))
      const textTerms = new Set(tokenize(doc.text.slice(0, 2000)))
      let score = 0
      for (const t of qterms) {
        if (titleTerms.has(t)) score += 3
        if (textTerms.has(t)) score += 1
      }
      // recency boost only when there is term overlap (never surface unrelated docs)
      if (score > 0) {
        const ageMs = now - doc.createdAt
        if (ageMs < 3_600_000) score += 0.5
        else if (ageMs < 86_400_000) score += 0.25
      }
      return { doc, score }
    })
    return scored
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(k, 1), 5))
  }

  async recent(k = 5): Promise<VectorDoc[]> {
    return [...this.docs].sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.min(Math.max(k, 1), 10))
  }

  async list(): Promise<VectorDoc[]> {
    return [...this.docs]
  }

  async clear(): Promise<void> {
    this.docs = []
  }

  /** Serialize for persistence (storage.local / file) */
  snapshot(): VectorDoc[] {
    return [...this.docs]
  }

  restore(docs: VectorDoc[]): void {
    this.docs = [...docs].slice(-200)
  }
}

export const agentMemory = new AgentMemory()
