/**
 * Pure runtime-mode resolution — no VS Code host, no watcher construction.
 *
 * Shared by `extension.ts` (config-driven) and `scripts/relay.ts`
 * (env/CLI-driven) so both surfaces resolve the `agentVisualizer.runtime` /
 * `AGENT_FLOW_RUNTIME` value identically, and so the resolver can be unit
 * tested without pulling in `vscode` or any runtime watcher.
 *
 * `import type` keeps this module free of the `vscode` import that
 * `session-runtime.ts` carries — the type is erased at compile time, so this
 * file has zero runtime dependencies beyond the language itself.
 */
import type { AgentRuntimeMode } from './session-runtime'

export type ConfiguredRuntimeMode = AgentRuntimeMode | 'auto'

const VALID_MODES: ReadonlySet<string> = new Set<AgentRuntimeMode>(['claude', 'codex', 'cursor'])

/**
 * Map a raw config/env string to a runtime mode. Unknown, missing, or
 * malformed values map to the documented safe default `'auto'` — which never
 * starts Cursor (ADR-006: Cursor is explicit-mode-only, not part of `auto`).
 */
export function resolveConfiguredMode(raw: string | undefined): ConfiguredRuntimeMode {
  return raw !== undefined && VALID_MODES.has(raw) ? (raw as AgentRuntimeMode) : 'auto'
}
