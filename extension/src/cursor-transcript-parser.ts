/**
 * Parser for Cursor main-session transcripts at
 * ~/.cursor/projects/<encoded>/agent-transcripts/<sid>/<sid>.jsonl
 *
 * Cursor writes one JSON object per line, best-effort shaped as:
 *   { role: 'user' | 'assistant', message: { content: [{ type, text? }] } }
 *
 * V1 is thin by design (ADR-006): main session only, spawn + messages only.
 * No tool_call_*, model_detected, context_update, subagent_dispatch, or
 * hierarchy events are emitted here — those are explicit follow-up scope.
 *
 * Any line that fails to parse as JSON, or whose top-level shape isn't a
 * user/assistant message (lifecycle/tool/model records Cursor may emit), is
 * skipped silently so later valid lines still emit. This mirrors
 * CodexRolloutParser's tolerant-parsing style.
 */

import { AgentEvent } from './protocol'
import { ORCHESTRATOR_NAME, HASH_PREFIX_MAX, MESSAGE_MAX } from './constants'

// ─── State ─────────────────────────────────────────────────────────────────

export interface CursorParseState {
  /** Orchestrator agent_spawn emitted flag — fires once, on first valid JSON line. */
  spawnEmitted: boolean
  /** Content hashes of already-emitted messages (for dedup across replays/tails). */
  seenMessageHashes: Set<string>
}

export function createCursorParseState(): CursorParseState {
  return {
    spawnEmitted: false,
    seenMessageHashes: new Set(),
  }
}

// ─── Delegate ──────────────────────────────────────────────────────────────

export interface CursorParserDelegate {
  /** Emit an agent event. */
  emit(event: AgentEvent, sessionId?: string): void
  /** Elapsed seconds since the session started. */
  elapsed(sessionId?: string): number
  /** Called when a session label is derived from the first user message. */
  setLabel?(label: string): void
}

// ─── Record shapes (structural typing, all fields optional) ────────────────

interface CursorContentBlock {
  type?: string
  text?: string
}

interface CursorMessagePayload {
  content?: CursorContentBlock[] | string
}

interface CursorRecord {
  role?: string
  message?: CursorMessagePayload
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

/** Flatten message content into a single trimmed string. Text-bearing blocks
 *  only — non-text blocks (and blocks with no `text`) contribute nothing, so
 *  we never invent prose for redacted/thinking-only segments. */
function flattenContent(content: CursorContentBlock[] | string | undefined): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map(c => String(c?.text || '')).join('').trim()
}

// ─── Parser ────────────────────────────────────────────────────────────────

export class CursorTranscriptParser {
  constructor(private delegate: CursorParserDelegate) {}

  /**
   * Parse a single JSONL line. Silently skips unparseable/unknown lines.
   *
   * @param line - Raw JSONL line from a `<sid>.jsonl` transcript.
   * @param state - Per-session parse state (see {@link createCursorParseState}).
   * @param agentName - Name attributed to emitted message events (V1: always
   *   the orchestrator; threaded through for a future subagent follow-up).
   * @param sessionId - Optional session id forwarded to the delegate.
   */
  processLine(line: string, state: CursorParseState, agentName: string, sessionId?: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let record: unknown
    try { record = JSON.parse(trimmed) }
    catch { return /* non-JSON or partial line at file tail; resume on next read */ }

    if (!isRecord(record)) return
    const { role, message } = record as CursorRecord

    // First successfully-parsed JSON line is "first valid activity" — spawn
    // fires once here, before shape-checking below, so unknown-but-valid
    // records still count as activity (mirrors CodexRolloutParser).
    this.ensureSpawned(state, sessionId)

    if (role !== 'user' && role !== 'assistant') return // unknown top-level shape (UT-062)

    const text = flattenContent(message?.content)
    if (!text) return

    const hash = `${role}:${text.slice(0, HASH_PREFIX_MAX)}`
    if (state.seenMessageHashes.has(hash)) return // UT-063
    state.seenMessageHashes.add(hash)

    this.delegate.emit({
      time: this.delegate.elapsed(sessionId),
      type: 'message',
      payload: {
        agent: agentName,
        role,
        content: text.slice(0, MESSAGE_MAX),
      },
    }, sessionId)
  }

  private ensureSpawned(state: CursorParseState, sessionId?: string): void {
    if (state.spawnEmitted) return
    state.spawnEmitted = true
    this.delegate.emit({
      time: this.delegate.elapsed(sessionId),
      type: 'agent_spawn',
      payload: { name: ORCHESTRATOR_NAME, isMain: true, task: 'Cursor session', runtime: 'cursor' },
    }, sessionId)
  }
}
