/**
 * Agentic tools — definitions + arg validation.
 * Pure (no browser/Node imports). Per-engine runners implement execution.
 * Read-only by default; only openTab can navigate and should be confirmed in UI.
 */
import type { ToolName } from '@shared/types/agent'

export interface ToolDef {
  name: ToolName
  description: string
  argsSchema: Record<string, { type: 'string' | 'number'; required: boolean; description: string }>
  needsConfirm: boolean
}

export const TOOL_DEFS: Record<ToolName, ToolDef> = {
  readPage: {
    name: 'readPage',
    description: 'Read the current page markdown (already extracted). Use for QA/summarize without re-fetch.',
    argsSchema: {
      maxChars: { type: 'number', required: false, description: 'Max chars to return (default 6000)' }
    },
    needsConfirm: false
  },
  searchMemory: {
    name: 'searchMemory',
    description: 'Search past page turns and notes for relevant context.',
    argsSchema: {
      query: { type: 'string', required: true, description: 'Keyword query' },
      k: { type: 'number', required: false, description: 'Top-k hits (default 3, max 5)' }
    },
    needsConfirm: false
  },
  recallHistory: {
    name: 'recallHistory',
    description: 'Recall recent visited pages (title + url) for multi-page synthesis.',
    argsSchema: {
      k: { type: 'number', required: false, description: 'How many recent pages (default 5, max 10)' }
    },
    needsConfirm: false
  },
  openTab: {
    name: 'openTab',
    description: 'Open a URL in a new tab. Requires user confirm in UI.',
    argsSchema: {
      url: { type: 'string', required: true, description: 'https:// URL to open' }
    },
    needsConfirm: true
  },
  summarizePage: {
    name: 'summarizePage',
    description: 'Produce 5-bullet summary of the current page context.',
    argsSchema: {},
    needsConfirm: false
  },
  extractTables: {
    name: 'extractTables',
    description: 'Extract markdown tables from the current page context.',
    argsSchema: {},
    needsConfirm: false
  },
  composioSearch: {
    name: 'composioSearch',
    description: 'Search 500+ connected apps for tools matching a task (e.g. "gmail fetch emails"). Use before composioExecute on unfamiliar tasks.',
    argsSchema: {
      query: { type: 'string', required: true, description: 'Natural-language task to find tools for' }
    },
    needsConfirm: false
  },
  composioExecute: {
    name: 'composioExecute',
    description: 'Execute a Composio app tool by slug (e.g. GMAIL_FETCH_EMAILS). Requires an ACTIVE app connection; use composioConnect first if unsure.',
    argsSchema: {
      toolSlug: { type: 'string', required: true, description: 'Exact tool slug from composioSearch (e.g. GMAIL_FETCH_EMAILS)' },
      argsJson: { type: 'string', required: false, description: 'JSON object string of tool arguments (default {})' },
      account: { type: 'string', required: false, description: 'Account id when multiple accounts are connected for the toolkit' }
    },
    needsConfirm: false
  },
  composioConnect: {
    name: 'composioConnect',
    description: 'Check or start an app connection (e.g. gmail, outlook, github). Returns ACTIVE status or an OAuth link the user must open.',
    argsSchema: {
      toolkit: { type: 'string', required: true, description: 'Toolkit slug (e.g. gmail, outlook, github, notion)' }
    },
    needsConfirm: false
  }
}

export const TOOL_NAMES = Object.keys(TOOL_DEFS) as ToolName[]

export function validateToolCall(tool: string, args: Record<string, unknown>): { ok: boolean; error?: string } {
  const def = (TOOL_DEFS as Record<string, ToolDef>)[tool]
  if (!def) return { ok: false, error: `Unknown tool: ${tool}` }
  for (const [key, spec] of Object.entries(def.argsSchema)) {
    const v = args[key]
    if (spec.required && (v === undefined || v === null || v === '')) {
      return { ok: false, error: `Missing required arg: ${key}` }
    }
    if (v !== undefined && spec.type === 'string' && typeof v !== 'string') {
      return { ok: false, error: `Arg ${key} must be string` }
    }
    if (v !== undefined && spec.type === 'number' && typeof v !== 'number') {
      return { ok: false, error: `Arg ${key} must be number` }
    }
  }
  if (tool === 'openTab') {
    const url = args['url']
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return { ok: false, error: 'openTab url must start with http(s)://' }
    }
  }
  return { ok: true }
}
