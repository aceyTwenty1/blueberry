/** Composio connector contract — shared Gecko + Electron, pure JSON, no Node/browser imports.
 *
 * Uses Composio Connect (shared MCP URL) with a consumer key (ck_...):
 *   URL: https://connect.composio.dev/mcp
 *   Header: x-consumer-api-key: <consumerKey>
 * Protocol: MCP streamable HTTP (JSON-RPC 2.0, SSE-framed responses).
 */

export interface ComposioConfig {
  enabled: boolean
  /** Consumer key (ck_...) from dashboard Sessions & API Key page. Stored encrypted. */
  consumerKey?: string
  baseUrl: string
}

export const DEFAULT_COMPOSIO_CONFIG: ComposioConfig = {
  enabled: false,
  baseUrl: 'https://connect.composio.dev/mcp'
}

export const COMPOSIO_STORAGE_KEY = 'blueberry:composio'

export interface McpToolSummary {
  name: string
  description: string
}

export interface ComposioConnectionInfo {
  toolkit: string
  status: 'active' | 'initiated' | 'failed' | 'unknown'
  /** OAuth / setup link when status is initiated */
  redirectUrl?: string
  accounts?: Array<{ id: string; status: string; isDefault?: boolean }>
}

export interface ComposioExecuteItem {
  toolSlug: string
  args: Record<string, unknown>
  /** Disambiguates when multiple accounts are connected for a toolkit */
  account?: string
}

export interface ComposioExecuteResult {
  ok: boolean
  /** Concatenated human-readable text from result content blocks */
  text: string
  raw: unknown
}
