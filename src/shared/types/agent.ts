/** Agentic integration contract — shared Gecko + Electron, pure JSON, no Node/browser imports */

export type ToolName =
  | 'readPage'
  | 'searchMemory'
  | 'recallHistory'
  | 'openTab'
  | 'summarizePage'
  | 'extractTables'
  | 'composioSearch'
  | 'composioExecute'
  | 'composioConnect'

export interface ToolCall {
  tool: ToolName
  args: Record<string, unknown>
}

export interface PlanStep extends ToolCall {
  id: string
  label: string
}

export interface AgentPlan {
  goal: string
  steps: PlanStep[]
}

export type AgentEvent =
  | { type: 'plan'; plan: AgentPlan }
  | { type: 'tool_start'; stepId: string; tool: ToolName; args: Record<string, unknown> }
  | { type: 'tool_result'; stepId: string; tool: ToolName; ok: boolean; result: string }
  | { type: 'answer'; delta: string }
  | { type: 'done'; answer: string }
  | { type: 'error'; message: string }

export interface AgentRunRequest {
  goal: string
  task?: 'summarize' | 'qa' | 'extract' | 'general'
  providerId?: string
  context?: import('./ai').PageContext
  maxSteps?: number
  confirmOpenTab?: boolean
}

export interface ToolResult {
  ok: boolean
  result: string
}

export const AGENT_LIMITS = {
  maxSteps: 5,
  stepTimeoutMs: 20_000,
  maxContextChars: 6000,
  maxMemoryHits: 3
} as const
