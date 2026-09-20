/**
 * Agent executor — engine-agnostic ReAct loop.
 * Pure core: the per-engine runner injects llmChat + runTool + emit + shouldConfirm.
 * Guarantees: max 5 steps, per-step timeout, JSON validation, graceful fallback to direct answer.
 */
import type { AgentEvent, AgentPlan, AgentRunRequest, ToolName, ToolResult } from '@shared/types/agent'
import { AGENT_LIMITS } from '@shared/types/agent'
import { parsePlan, buildPlannerPrompt } from './planner'
import { validateToolCall } from './tools'

export interface ExecutorDeps {
  llmChat: (messages: Array<{ role: string; content: string }>, opts?: { maxTokens?: number }) => Promise<string>
  runTool: (tool: ToolName, args: Record<string, unknown>) => Promise<ToolResult>
  emit: (e: AgentEvent) => void | Promise<void>
  confirm?: (tool: ToolName, args: Record<string, unknown>) => Promise<boolean>
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

export async function runAgent(req: AgentRunRequest, deps: ExecutorDeps): Promise<string> {
  const maxSteps = Math.min(Math.max(req.maxSteps ?? AGENT_LIMITS.maxSteps, 1), AGENT_LIMITS.maxSteps)
  const emit = async (e: AgentEvent) => {
    await deps.emit(e)
  }

  // 1. Plan via tiny LLM (best-effort; fallback to single readPage step on any failure)
  let plan: AgentPlan
  try {
    const plannerPrompt = buildPlannerPrompt(
      req.goal,
      req.task ?? 'general',
      !!req.context,
      req.context ? `${req.context.title}` : ''
    )
    const raw = await withTimeout(
      deps.llmChat(
        [
          { role: 'system', content: 'You are a planner. Output ONLY JSON.' },
          { role: 'user', content: plannerPrompt }
        ],
        { maxTokens: 256 }
      ),
      AGENT_LIMITS.stepTimeoutMs,
      'planner'
    )
    plan = parsePlan(raw, req.goal)
  } catch {
    plan = { goal: req.goal, steps: [{ id: 's1', label: 'Read page', tool: 'readPage', args: {} }] }
  }
  plan.steps = plan.steps.slice(0, maxSteps)
  await emit({ type: 'plan', plan })

  // 2. Execute steps, collect observations
  const observations: string[] = []
  for (const step of plan.steps) {
    const v = validateToolCall(step.tool, step.args ?? {})
    if (!v.ok) {
      await emit({ type: 'tool_result', stepId: step.id, tool: step.tool, ok: false, result: `Skipped: ${v.error}` })
      continue
    }
    if (step.tool === 'openTab' && req.confirmOpenTab !== false) {
      const ok = deps.confirm ? await deps.confirm(step.tool, step.args) : true
      if (!ok) {
        await emit({ type: 'tool_result', stepId: step.id, tool: step.tool, ok: false, result: 'User declined to open tab.' })
        continue
      }
    }
    await emit({ type: 'tool_start', stepId: step.id, tool: step.tool, args: step.args })
    try {
      const res = await withTimeout(deps.runTool(step.tool, step.args), AGENT_LIMITS.stepTimeoutMs, `tool ${step.tool}`)
      observations.push(`[${step.tool}] ${res.result.slice(0, 1500)}`)
      await emit({ type: 'tool_result', stepId: step.id, tool: step.tool, ok: res.ok, result: res.result.slice(0, 2000) })
      if (!res.ok && step.tool === 'readPage') break
    } catch (e) {
      const msg = String(e).slice(0, 300)
      observations.push(`[${step.tool} error] ${msg}`)
      await emit({ type: 'tool_result', stepId: step.id, tool: step.tool, ok: false, result: msg })
    }
  }

  // 3. Synthesize final answer (grounded in observations + page context)
  const ctxBlock = req.context
    ? `\n\nPage: ${req.context.title} (${req.context.url})\n${req.context.markdown.slice(0, AGENT_LIMITS.maxContextChars)}`
    : ''
  const obsBlock = observations.length > 0 ? `\n\nTool observations:\n${observations.join('\n')}` : ''
  const finalPrompt = `Goal: ${req.goal}${ctxBlock}${obsBlock}\n\nAnswer concisely in markdown. If tools failed, answer from page context.`
  let answer = ''
  try {
    answer = await withTimeout(
      deps.llmChat(
        [
          { role: 'system', content: 'You are Blueberry agent. Answer concisely in markdown, grounded in observations.' },
          { role: 'user', content: finalPrompt }
        ],
        { maxTokens: 512 }
      ),
      AGENT_LIMITS.stepTimeoutMs,
      'synthesis'
    )
  } catch (e) {
    await emit({ type: 'error', message: String(e).slice(0, 300) })
    answer = observations.length > 0 ? observations.join('\n\n') : 'Agent failed to produce an answer.'
  }
  await emit({ type: 'done', answer })
  return answer
}
