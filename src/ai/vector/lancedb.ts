/**
 * Vector Store — LanceDB scaffold (Step 1).
 * Step 4/5 wires @lancedb/lancedb for history/bookmark indexing and RAG.
 */

export interface VectorDoc {
  id: string
  url: string
  title: string
  text: string
  embedding?: number[]
  createdAt: number
}

export class VectorStore {
  private docs: VectorDoc[] = []

  async add(doc: Omit<VectorDoc, 'createdAt'>): Promise<void> {
    this.docs.push({ ...doc, createdAt: Date.now() })
  }

  async search(query: string, k = 5): Promise<VectorDoc[]> {
    // naive substring search until real embeddings land
    const q = query.toLowerCase()
    return this.docs.filter((d) => d.text.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)).slice(0, k)
  }

  async list(): Promise<VectorDoc[]> {
    return [...this.docs]
  }

  async clear(): Promise<void> {
    this.docs = []
  }
}

export const vectorStore = new VectorStore()
