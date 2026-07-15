/**
 * Pure runtime-presentation helpers — no canvas/React dependency — so spawn
 * discriminator mapping, assistant labels, and brand-mark selection can be
 * unit tested without a canvas harness (UT-030–UT-033, UT-035).
 *
 * ADR-006: Cursor is text-label only. `brandMark` must never fall through to
 * the Claude spark or the OpenAI mark for `runtime: 'cursor'`.
 */
import type { Agent } from './agent-types'

export type AgentRuntime = NonNullable<Agent['runtime']>

const RUNTIME_VALUES: ReadonlySet<string> = new Set<AgentRuntime>(['claude', 'codex', 'cursor'])

/**
 * Maps a spawn event's `payload.runtime` to the Agent runtime discriminator.
 * Unknown/missing values resolve to `undefined` (Claude presentation default),
 * matching the pre-Cursor behavior for anything that isn't an explicit runtime.
 */
export function resolveSpawnRuntime(payloadRuntime: unknown): AgentRuntime | undefined {
  return typeof payloadRuntime === 'string' && RUNTIME_VALUES.has(payloadRuntime)
    ? (payloadRuntime as AgentRuntime)
    : undefined
}

/** Assistant/transcript/bubble label for the agent's runtime. Defaults to CLAUDE. */
export function assistantLabel(runtime: AgentRuntime | undefined): 'CLAUDE' | 'CODEX' | 'CURSOR' {
  if (runtime === 'codex') return 'CODEX'
  if (runtime === 'cursor') return 'CURSOR'
  return 'CLAUDE'
}

/** Which brand mark `drawAgentBrand` should paint. 'none' = no logo (Cursor, ADR-006 non-fallthrough). */
export function brandMark(runtime: AgentRuntime | undefined): 'claude-spark' | 'openai-logo' | 'none' {
  if (runtime === 'codex') return 'openai-logo'
  if (runtime === 'cursor') return 'none'
  return 'claude-spark'
}
