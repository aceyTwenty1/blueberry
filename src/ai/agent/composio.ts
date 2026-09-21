/**
 * Composio Connect client — pure MCP over fetch, no deps.
 * Shared by Gecko background and Electron main. Uses global fetch (present in both).
 * Auth: x-consumer-api-key header (consumer key, ck_...). Never log the key.
 *
 * Verified live against https://connect.composio.dev/mcp:
 * initialize → tools/list → COMPOSIO_SEARCH_TOOLS → COMPOSIO_MANAGE_CONNECTIONS
 * → COMPOSIO_MULTI_EXECUTE_TOOL (per-item `account` disambiguates multi-account toolkits).
 */
import type {
  ComposioConfig,
  ComposioConnectionInfo,
  ComposioExecuteItem,
  ComposioExecuteResult,
  McpToolSummary
} from '@shared/types/composio'

export const COMPOSIO_META_TOOLS = {
  search: 'COMPOSIO_SEARCH_TOOLS',
  multiExecute: 'COMPOSIO_MULTI_EXECUTE_TOOL',
  manageConnections: 'COMPOSIO_MANAGE_CONNECTIONS',
  getSchemas: 'COMPOSIO_GET_TOOL_SCHEMAS'
} as const

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number
  result?: {
    content?: Array<{ type?: string; text?: string }>
    // meta-tool payloads are embedded in content[0].text as JSON
  }
  error?: { code?: number; message?: string }
}

/** Parse SSE-framed MCP response bodies into JSON-RPC payloads. */
export function parseSseMessages(body: string): unknown[] {
  const out: unknown[] = []
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('data: ')) continue
    const data = t.slice(6).trim()
    if (!data || data === '[DONE]') continue
    try {
      out.push(JSON.parse(data))
    } catch {
      // ignore partial frames
    }
  }
  return out
}

function headersFor(cfg: ComposioConfig): Record<string, string> {
  if (!cfg.consumerKey) throw new Error('Composio consumer key not configured. Set it in Blueberry Settings → Composio.')
  return {
    'x-consumer-api-key': cfg.consumerKey,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  }
}

export async function mcpRpc(
  cfg: ComposioConfig,
  method: string,
  params: Record<string, unknown> | undefined,
  id: number,
  timeoutMs = 120_000
): Promise<JsonRpcResponse> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: headersFor(cfg),
      body: JSON.stringify({ jsonrpc: '2.0', id, ...(params !== undefined ? { params } : {}) }),
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error(`Composio MCP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.text()
    const msgs = parseSseMessages(body)
    // Prefer the message matching our id, else first payload-bearing message
    const match =
      msgs.find((m) => (m as JsonRpcResponse).id === id) ??
      msgs.find((m) => !!(m as JsonRpcResponse).result || !!(m as JsonRpcResponse).error)
    if (!match) throw new Error('Composio MCP: empty response envelope')
    const rpc = match as JsonRpcResponse
    if (rpc.error) throw new Error(`Composio MCP error ${rpc.error.code ?? ''}: ${rpc.error.message ?? 'unknown'}`.trim())
    return rpc
  } finally {
    clearTimeout(t)
  }
}

/** Extract concatenated text from an MCP result's content blocks. */
export function mcpResultText(rpc: JsonRpcResponse): string {
  const content = rpc.result?.content ?? []
  return content
    .map((c) => (typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n')
}

/** tools/list — the 11 meta tools (search, multi-execute, manage-connections, ...). */
export async function composioListTools(cfg: ComposioConfig): Promise<McpToolSummary[]> {
  const rpc = await mcpRpc(cfg, 'tools/list', {}, 1)
  const tools = ((rpc.result ?? {}) as { tools?: Array<{ name?: string; description?: string }> }).tools ?? []
  return tools.map((t) => ({ name: t.name ?? '?', description: (t.description ?? '').slice(0, 200) }))
}

/** Call a meta tool and return its embedded JSON payload (parsed) plus raw text. */
async function callMetaTool(cfg: ComposioConfig, name: string, args: Record<string, unknown>): Promise<{ text: string; json: unknown }> {
  const rpc = await mcpRpc(cfg, 'tools/call', { name, arguments: args }, 2)
  const text = mcpResultText(rpc)
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { text, json }
}

/** Discover app tools for a natural-language query (e.g. "gmail fetch emails"). */
export async function composioSearchTools(cfg: ComposioConfig, query: string, limit = 10): Promise<string> {
  const { text } = await callMetaTool(cfg, COMPOSIO_META_TOOLS.search, { query, limit })
  return text.slice(0, 6000)
}

/** Input schemas for tool slugs (needed before first execution of unfamiliar tools). */
export async function composioGetSchemas(cfg: ComposioConfig, toolSlugs: string[]): Promise<string> {
  const { text } = await callMetaTool(cfg, COMPOSIO_META_TOOLS.getSchemas, { tool_slugs: toolSlugs })
  return text.slice(0, 8000)
}

/** Check or initiate a toolkit connection. Returns status + OAuth redirect_url when pending. */
export async function composioManageConnections(cfg: ComposioConfig, toolkits: string[]): Promise<ComposioConnectionInfo[]> {
  const { json, text } = await callMetaTool(cfg, COMPOSIO_META_TOOLS.manageConnections, { toolkits })
  const results = (json as { data?: { results?: Record<string, Record<string, unknown>> } } | null)?.data?.results ?? {}
  const infos: ComposioConnectionInfo[] = []
  for (const [toolkit, r] of Object.entries(results)) {
    const status = String(r['status'] ?? 'unknown')
    infos.push({
      toolkit,
      status: status === 'active' ? 'active' : status === 'initiated' ? 'initiated' : status === 'failed' ? 'failed' : 'unknown',
      redirectUrl: typeof r['redirect_url'] === 'string' ? (r['redirect_url'] as string) : undefined,
      accounts: Array.isArray(r['accounts'])
        ? (r['accounts'] as Array<Record<string, unknown>>).map((a) => ({
            id: String(a['id'] ?? ''),
            status: String(a['status'] ?? ''),
            isDefault: a['is_default'] === true
          }))
        : undefined
    })
  }
  if (infos.length === 0) throw new Error(`Composio: no connection info returned. Raw: ${text.slice(0, 300)}`)
  return infos
}

/**
 * Execute 1..N independent app tools. `account` per item disambiguates
 * multi-account toolkits (server errors otherwise). `thought`/`memory` are required by the executor.
 */
export async function composioMultiExecute(cfg: ComposioConfig, items: ComposioExecuteItem[], thought = 'agent step'): Promise<ComposioExecuteResult> {
  const tools = items.map((it) => {
    const entry: Record<string, unknown> = { tool_slug: it.toolSlug, arguments: it.args }
    if (it.account) entry['account'] = it.account
    return entry
  })
  const { text, json } = await callMetaTool(cfg, COMPOSIO_META_TOOLS.multiExecute, {
    tools,
    thought,
    memory: {}
  })
  const data = (json as { data?: { success_count?: number; error_count?: number } | null })?.data
  const ok = data ? (data.error_count ?? 1) === 0 : !/failed/i.test(text.slice(0, 200))
  return { ok, text: text.slice(0, 8000), raw: json ?? text }
}
