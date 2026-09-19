/**
 * Optional local Express server for AI routing (Step 5).
 * Not auto-started in Step 1; main process handles IPC directly.
 * Reserved for Tavily/SearXNG augmentation and background RAG.
 */
export function createAIServer() {
  // Stub — implemented in Step 5 with express + cors
  return { start: async () => {}, stop: async () => {} }
}
