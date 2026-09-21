/**
 * Agent planner — tiny-LLM friendly JSON planning with robust fallback.
 * 135M models often emit weak JSON, so: strict prompt + repair parser + single-step fallback.
 * Pure (no I/O). The per-engine runner supplies llmChat().
 */
import type { AgentPlan, PlanStep, ToolName } from '@shared/types/agent'
import { TOOL_NAMES, validateToolCall } from './tools'

export function buildPlannerPrompt(goal: string, task: string, hasContext: boolean, memoryHint: string): string {
  const tools = TOOL_NAMES.join(', ')
  return [
    'You are Blueberry planner. Output ONLY JSON, no prose.',
    `Task: ${task}. Goal: ${goal}`,
    `Page context attached: ${hasContext ? 'yes' : 'no'}. Memory hint: ${memoryHint || 'none'}.`,
    `Allowed tools: ${tools}.`,
    'Rules: 1-5 steps. Prefer readPage/searchMemory/recallHistory first. Use openTab ONLY if user asked to open/go somewhere.',
    'For external apps (email, calendar, github, docs): composioConnect to check the connection, then composioSearch to find the tool, then composioExecute with exact args. NEVER invent tool slugs.',
    'Schema: {"goal":"...","steps":[{"id":"s1","label":"...","tool":"readPage","args":{}}]}',
    'Now output the JSON plan:'
  ].join('\n')
}

/** Repair-tolerant plan parser: extracts first {...} or [...] JSON block, validates tools/args */
export function parsePlan(raw: string, goal: string): AgentPlan {
  const fallback: AgentPlan = {
    goal,
    steps: [{ id: 's1', label: 'Read page', tool: 'readPage', args: {} }]
  }
  if (!raw || !raw.trim()) return fallback
  const text = raw.trim()
  // Find first JSON object or array block
  const startObj = text.indexOf('{')
  const startArr = text.indexOf('[')
  let candidate = ''
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) {
    // balance braces from startObj
    let depth = 0
    let end = -1
    for (let i = startObj; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    candidate = end > 0 ? text.slice(startObj, end) : text.slice(startObj)
  } else if (startArr >= 0) {
    let depth = 0
    let end = -1
    for (let i = startArr; i < text.length; i++) {
      const ch = text[i]
      if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    const arrText = end > 0 ? text.slice(startArr, end) : text.slice(startArr)
    candidate = `{"goal":${JSON.stringify(goal)},"steps":${arrText}}`
  } else {
    return fallback
  }
  try {
    const parsed = JSON.parse(candidate) as { goal?: string; steps?: Array<Record<string, unknown>> }
    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
    const steps: PlanStep[] = []
    for (let i = 0; i < Math.min(rawSteps.length, 5); i++) {
      const s = rawSteps[i]!
      const tool = String(s['tool'] ?? '')
      if (!(TOOL_NAMES as string[]).includes(tool)) continue
      const args = (s['args'] as Record<string, unknown>) ?? {}
      if (!validateToolCall(tool, args).ok) continue
      steps.push({
        id: String(s['id'] ?? `s${i + 1}`),
        label: String(s['label'] ?? tool),
        tool: tool as ToolName,
        args
      })
    }
    if (steps.length === 0) return fallback
    return { goal: String(parsed.goal ?? goal), steps }
  } catch {
    return fallback
  }
}
