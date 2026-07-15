/**
 * Parser for Cursor main-session transcripts at
 * ~/.cursor/projects/<encoded>/agent-transcripts/<sid>/<sid>.jsonl
 *
 * Cursor writes one JSON object per line, best-effort shaped as:
 *   { role: 'user' | 'assistant', message: { content: [{ type, text? }] } }
 *
 * Parses user/assistant messages only; unparseable or unknown-shaped lines
 * (lifecycle/tool/model records Cursor may emit) are skipped silently, same
 * tolerant style as CodexRolloutParser.
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

/** Flatten message content into a single trimmed string. Non-text blocks contribute nothing. */
function flattenContent(content: CursorContentBlock[] | string | undefined): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map(c => String(c?.text || '')).join('').trim()
}

// ─── Parser ────────────────────────────────────────────────────────────────

export class CursorTranscriptParser {
  constructor(private delegate: CursorParserDelegate) {}

  /** Parse a single JSONL line. Silently skips unparseable/unknown lines. */
  processLine(line: string, state: CursorParseState, agentName: string, sessionId?: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let record: unknown
    try { record = JSON.parse(trimmed) }
    catch { return /* non-JSON or partial line at file tail; resume on next read */ }

    if (!isRecord(record)) return
    const { role, message } = record as CursorRecord

    // Any parseable line counts as activity, even unknown shapes (mirrors CodexRolloutParser).
    this.ensureSpawned(state, sessionId)

    if (role !== 'user' && role !== 'assistant') return // unknown top-level shape

    const text = flattenContent(message?.content)
    if (!text) return

    const hash = `${role}:${text.slice(0, HASH_PREFIX_MAX)}`
    if (state.seenMessageHashes.has(hash)) return // dedup: already emitted this content
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
