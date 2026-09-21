/**
 * Vector Store — scored keyword retrieval backed by AgentMemory.
 * (Named lancedb for the Step 4/5 migration path: swap this class for a
 * real LanceDB + embeddings backend without touching callers.)
 */
import { AgentMemory } from '../agent/memory'

export interface VectorDoc {
  id: string
  url: string
  title: string
  text: string
  embedding?: number[]
  createdAt: number
}

export class VectorStore {
  private mem = new AgentMemory()

  async add(doc: Omit<VectorDoc, 'createdAt'>): Promise<void> {
    await this.mem.add(doc)
  }

  async search(query: string, k = 5): Promise<VectorDoc[]> {
    const hits = await this.mem.recall(query, k)
    return hits.map((h) => h.doc)
  }

  async list(): Promise<VectorDoc[]> {
    return this.mem.list()
  }

  async clear(): Promise<void> {
    await this.mem.clear()
  }
}

export const vectorStore = new VectorStore()
