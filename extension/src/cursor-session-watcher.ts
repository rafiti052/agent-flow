/**
 * Watches Cursor main-session transcripts at
 * $CURSOR_HOME/projects/<encoded-workspace>/agent-transcripts/<sid>/<sid>.jsonl
 *
 * Cursor binds sessions to a workspace via the encoded project directory
 * name (see cursor-path.ts), so there's a single exact root to scan rather
 * than Codex's cwd-matching sweep across dated session directories. A
 * missing project directory is treated as idle-healthy, not a failure.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { AgentEvent, SessionInfo } from './protocol'
import {
  ACTIVE_SESSION_AGE_S, INACTIVITY_TIMEOUT_MS, ORCHESTRATOR_NAME,
  POLL_FALLBACK_MS, SCAN_INTERVAL_MS, SESSION_ID_DISPLAY,
} from './constants'
import { readNewFileLines } from './fs-utils'
import { createLogger } from './logger'
import {
  CursorTranscriptParser, CursorParseState, createCursorParseState,
} from './cursor-transcript-parser'
import { encodeCursorProjectPath } from './cursor-path'
import type { AgentSessionWatcher, SessionLifecycleEvent } from './session-runtime'
import { TypedEventEmitter } from './typed-event-emitter'

const log = createLogger('CursorSessionWatcher')

/** Resolve Cursor's home directory: CURSOR_HOME override or the ~/.cursor default. */
export function cursorHome(): string {
  return process.env.CURSOR_HOME || path.join(os.homedir(), '.cursor')
}

/** Render a Cursor home path with the user's home directory collapsed to `~`,
 *  matching how codex-runtime.ts labels CODEX_HOME. */
export function cursorHomeLabel(home: string = cursorHome()): string {
  const h = os.homedir()
  return home.startsWith(h) ? home.replace(h, '~') : home
}

/** Connection-status string for a Cursor runtime — always contains a
 *  `Cursor`-distinguishable substring and the resolved home label. */
export function cursorConnectionStatus(home: string = cursorHome()): string {
  return `Cursor session watcher (${cursorHomeLabel(home)})`
}

interface WatchedCursorSession {
  sessionId: string
  filePath: string
  fileWatcher: fs.FSWatcher | null
  pollTimer: NodeJS.Timeout | null
  inactivityTimer: NodeJS.Timeout | null
  fileSize: number
  /** Leftover bytes past the last newline from the previous read — prepended
   *  to the next chunk so a JSONL line split across reads gets reassembled. */
  fileTail: string
  sessionStartTime: number
  lastActivityTime: number
  sessionDetected: boolean
  sessionCompleted: boolean
  label: string
  parseState: CursorParseState
}

// ─── Watcher ───────────────────────────────────────────────────────────────

export class CursorSessionWatcher implements AgentSessionWatcher {
  private sessions = new Map<string, WatchedCursorSession>()
  private rootWatcher: fs.FSWatcher | null = null
  private scanInterval: NodeJS.Timeout | null = null
  private running = false

  /** Cursor home this watcher resolved to — exposed so the runtime factory
   *  can build a consistent connection-status label without re-deriving it. */
  readonly home: string

  private readonly _onEvent = new TypedEventEmitter<AgentEvent>()
  private readonly _onSessionDetected = new TypedEventEmitter<string>()
  private readonly _onSessionLifecycle = new TypedEventEmitter<SessionLifecycleEvent>()

  readonly onEvent = this._onEvent.event
  readonly onSessionDetected = this._onSessionDetected.event
  readonly onSessionLifecycle = this._onSessionLifecycle.event

  private readonly parser = new CursorTranscriptParser({
    emit: (event, sessionId) => this._onEvent.fire({ ...event, sessionId }),
    elapsed: (sessionId) => {
      const s = sessionId ? this.sessions.get(sessionId) : undefined
      return s ? (Date.now() - s.sessionStartTime) / 1000 : 0
    },
  })

  /** `workspace` unset attaches to no project (idle-healthy). `homeOverride` is injectable CURSOR_HOME for tests. */
  constructor(private readonly workspace?: string | null, homeOverride?: string) {
    this.home = homeOverride ?? cursorHome()
  }

  /** Exact `$CURSOR_HOME/projects/<encoded>/agent-transcripts` root for the
   *  bound workspace, or null if none. Recomputed on every call, not cached, so a late-attaching workspace folder is picked up correctly. */
  private transcriptsRoot(): string | null {
    if (!this.workspace) return null
    return path.join(this.home, 'projects', encodeCursorProjectPath(this.workspace), 'agent-transcripts')
  }

  isActive(): boolean {
    return this.running
  }

  isSessionActive(sessionId: string): boolean {
    const s = this.sessions.get(sessionId)
    return !!s && s.sessionDetected && !s.sessionCompleted
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.sessionId,
      label: s.label,
      status: s.sessionCompleted ? 'completed' : 'active',
      startTime: s.sessionStartTime,
      lastActivityTime: s.lastActivityTime,
    }))
  }

  replaySessionStart(sessionIds?: string[]): void {
    for (const [id, session] of this.sessions) {
      if (!session.sessionDetected) continue
      if (sessionIds && !sessionIds.includes(id)) continue
      this._onSessionLifecycle.fire({ type: 'started', sessionId: id, label: session.label })
    }
  }

  start(): void {
    this.running = true
    this.scanForSessions()
    this.scanInterval = setInterval(() => this.scanForSessions(), SCAN_INTERVAL_MS)
    log.info(`Watching ${this.transcriptsRoot() ?? '<no workspace>'} (Cursor home: ${this.home})`)
  }

  private scanForSessions(): void {
    const root = this.transcriptsRoot()
    if (!root) return // no workspace bound — idle healthy

    // Watch the transcripts root for new session dirs; it may not exist yet —
    // retry on the next scan tick.
    if (!this.rootWatcher && fs.existsSync(root)) {
      try {
        this.rootWatcher = fs.watch(root, () => this.scanForSessions())
      } catch (err) { log.debug('Root dir watch failed:', root, err) }
    }

    let entries: string[]
    try { entries = fs.readdirSync(root) }
    catch { return } // missing/unreadable root — idle healthy

    for (const sessionId of entries) {
      if (this.sessions.has(sessionId)) continue // dedup repeat discovery

      const filePath = path.join(root, sessionId, `${sessionId}.jsonl`)
      let stat: fs.Stats
      try { stat = fs.statSync(filePath) } catch { continue } // no <sid>.jsonl here — not a session dir
      if (stat.size === 0) continue

      const ageS = (Date.now() - stat.mtimeMs) / 1000
      if (ageS > ACTIVE_SESSION_AGE_S) continue // stale — not a live target

      this.attachSession(sessionId, filePath, stat)
    }
  }

  private attachSession(sessionId: string, filePath: string, stat: fs.Stats): void {
    const label = `Cursor ${sessionId.slice(0, SESSION_ID_DISPLAY)}`

    const session: WatchedCursorSession = {
      sessionId,
      filePath,
      fileWatcher: null,
      pollTimer: null,
      inactivityTimer: null,
      fileSize: 0,
      fileTail: '',
      sessionStartTime: stat.birthtimeMs || stat.mtimeMs,
      lastActivityTime: stat.mtimeMs,
      sessionDetected: false,
      sessionCompleted: false,
      label,
      parseState: createCursorParseState(),
    }
    this.sessions.set(sessionId, session)

    // Drain existing content first, so late-opening panels see full history.
    this.readNewLines(sessionId)

    session.sessionDetected = true
    this._onSessionDetected.fire(sessionId)
    this._onSessionLifecycle.fire({ type: 'started', sessionId, label })

    try {
      session.fileWatcher = fs.watch(filePath, () => this.readNewLines(sessionId))
    } catch (err) { log.debug('File watch failed:', filePath, err) }

    // fs.watch sometimes silently stops after long idle — poll as backup.
    session.pollTimer = setInterval(() => this.readNewLines(sessionId), POLL_FALLBACK_MS)

    this.resetInactivityTimer(sessionId)
    log.info(`Attached to session ${sessionId.slice(0, SESSION_ID_DISPLAY)} at ${filePath}`)
  }

  private readNewLines(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Transient read errors (file briefly locked/removed mid-write) return
    // null and leave fileSize/fileTail untouched — the next watch/poll tick
    // retries cleanly without losing or duplicating content.
    const result = readNewFileLines(session.filePath, session.fileSize, session.fileTail)
    if (!result) return
    session.fileSize = result.newSize
    session.fileTail = result.tail
    session.lastActivityTime = Date.now()

    // Re-activate if the session had been marked complete on inactivity —
    // new content means the user resumed the Cursor session.
    if (session.sessionCompleted) {
      session.sessionCompleted = false
      this._onSessionLifecycle.fire({ type: 'started', sessionId, label: session.label })
      log.info(`Session ${sessionId.slice(0, SESSION_ID_DISPLAY)} re-activated after idle`)
    }

    for (const line of result.lines) {
      // A single corrupt/garbled line must not take the session (or watcher)
      // down — other valid sessions in the same project keep working.
      try { this.parser.processLine(line, session.parseState, ORCHESTRATOR_NAME, sessionId) }
      catch (err) { log.debug('Parser threw on line:', err) }
    }

    this.resetInactivityTimer(sessionId)
  }

  private resetInactivityTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.inactivityTimer) { clearTimeout(session.inactivityTimer) }
    session.inactivityTimer = setTimeout(() => {
      if (session.sessionCompleted) return
      session.sessionCompleted = true
      this._onEvent.fire({
        time: (Date.now() - session.sessionStartTime) / 1000,
        type: 'agent_complete',
        payload: { name: ORCHESTRATOR_NAME, sessionEnd: true },
        sessionId,
      })
      this._onSessionLifecycle.fire({ type: 'ended', sessionId, label: session.label })
    }, INACTIVITY_TIMEOUT_MS)
  }

  dispose(): void {
    this.running = false
    if (this.scanInterval) { clearInterval(this.scanInterval) }
    this.rootWatcher?.close()
    this.rootWatcher = null
    for (const s of this.sessions.values()) {
      s.fileWatcher?.close()
      if (s.pollTimer) clearInterval(s.pollTimer)
      if (s.inactivityTimer) clearTimeout(s.inactivityTimer)
    }
    this.sessions.clear()
    this._onEvent.dispose()
    this._onSessionDetected.dispose()
    this._onSessionLifecycle.dispose()
  }
}
