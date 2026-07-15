/**
 * Unit + temp-home integration tests for CursorSessionWatcher.
 *
 * Discovery, lifecycle (inactivity/rediscovery), dedup, and resilience are
 * exercised against a real temp `$CURSOR_HOME/projects/<encoded>/agent-transcripts`
 * tree — the same style CodexSessionWatcher would use, adapted for Cursor's
 * simpler single-root-per-workspace layout (ADR-003 / ADR-006).
 *
 * Node's built-in timer mocking (`mock.timers`) fakes both `Date` and the
 * `setTimeout`/`setInterval` the watcher schedules, so inactivity (5 min) and
 * activity-age (10 min) boundaries can be exercised without real waiting.
 * File mtimes stay real (set via `fs.utimesSync` where a specific age is
 * needed) — advancing the mocked clock after that moves "now" forward while
 * the on-disk mtime stays fixed, so elapsed-time math comes out correctly.
 */

import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  CursorSessionWatcher, cursorHomeLabel, cursorConnectionStatus,
} from '../src/cursor-session-watcher'
import { encodeCursorProjectPath } from '../src/cursor-path'
import { ACTIVE_SESSION_AGE_S, INACTIVITY_TIMEOUT_MS, POLL_FALLBACK_MS } from '../src/constants'
import type { AgentEvent } from '../src/protocol'

const VALID_LINE = '{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}'

/** Build a temp $CURSOR_HOME with a `<sid>/<sid>.jsonl` under the encoded
 *  project dir for `workspace`, seeded with `content`. */
function seedSession(home: string, workspace: string, sessionId: string, content: string): string {
  const dir = path.join(home, 'projects', encodeCursorProjectPath(workspace), 'agent-transcripts', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${sessionId}.jsonl`)
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('CursorSessionWatcher', () => {
  let home: string
  let workspace: string
  const watchers: CursorSessionWatcher[] = []

  before(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-home-'))
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-ws-'))
  })

  after(() => {
    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  afterEach(() => {
    for (const w of watchers.splice(0)) w.dispose()
  })

  function makeWatcher(ws: string | null = workspace): CursorSessionWatcher {
    const w = new CursorSessionWatcher(ws, home)
    watchers.push(w)
    return w
  }

  describe('discovery (UT-002, IT-001)', () => {
    it('finds a recently-modified session under the encoded project dir after start()', () => {
      seedSession(home, workspace, 'sid-discover-1', VALID_LINE + '\n')
      const w = makeWatcher()
      w.start()
      const ids = w.getActiveSessions().map(s => s.id)
      assert.ok(ids.includes('sid-discover-1'))
    })

    it('fires onSessionDetected for a newly discovered session', () => {
      seedSession(home, workspace, 'sid-discover-2', VALID_LINE + '\n')
      const w = makeWatcher()
      const detected: string[] = []
      w.onSessionDetected(id => detected.push(id))
      w.start()
      assert.ok(detected.includes('sid-discover-2'))
    })
  })

  describe('exclusion (IT-002)', () => {
    it('never lists another project\'s sessions', () => {
      const otherWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-other-'))
      seedSession(home, workspace, 'sid-mine', VALID_LINE + '\n')
      seedSession(home, otherWorkspace, 'sid-other', VALID_LINE + '\n')
      const w = makeWatcher()
      w.start()
      const ids = w.getActiveSessions().map(s => s.id)
      assert.ok(ids.includes('sid-mine'))
      assert.ok(!ids.includes('sid-other'))
      fs.rmSync(otherWorkspace, { recursive: true, force: true })
    })
  })

  describe('boundary: stale session age (UT-004)', () => {
    it('does not attach a session whose mtime is older than ACTIVE_SESSION_AGE_S', () => {
      const filePath = seedSession(home, workspace, 'sid-stale', VALID_LINE + '\n')
      const oldTime = new Date(Date.now() - (ACTIVE_SESSION_AGE_S + 60) * 1000)
      fs.utimesSync(filePath, oldTime, oldTime)
      const w = makeWatcher()
      w.start()
      const ids = w.getActiveSessions().map(s => s.id)
      assert.ok(!ids.includes('sid-stale'))
    })
  })

  describe('boundary: empty project (UT-006)', () => {
    it('reports zero sessions and stays active for an empty agent-transcripts dir', () => {
      const emptyWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-empty-'))
      fs.mkdirSync(path.join(home, 'projects', encodeCursorProjectPath(emptyWorkspace), 'agent-transcripts'), { recursive: true })
      const w = makeWatcher(emptyWorkspace)
      w.start()
      assert.deepEqual(w.getActiveSessions(), [])
      assert.equal(w.isActive(), true)
      fs.rmSync(emptyWorkspace, { recursive: true, force: true })
    })

    it('treats a missing project root as idle-healthy, not a hard failure', () => {
      const missingWorkspace = path.join(os.tmpdir(), 'agent-flow-cursor-does-not-exist-' + Date.now())
      const w = makeWatcher(missingWorkspace)
      assert.doesNotThrow(() => w.start())
      assert.deepEqual(w.getActiveSessions(), [])
      assert.equal(w.isActive(), true)
    })
  })

  describe('dedup (UT-005, IT-005)', () => {
    it('does not create a second SessionInfo when the same session is rediscovered', () => {
      seedSession(home, workspace, 'sid-dedup', VALID_LINE + '\n')
      const w = makeWatcher()
      // Enable mock timers before start() so the scan-interval timer it
      // schedules is itself virtual — real repeated discovery ticks (duplicate
      // FS events / re-scans) must not duplicate the entry (Map dedup).
      mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
      try {
        w.start()
        for (let i = 0; i < 3; i++) mock.timers.tick(1000 /* SCAN_INTERVAL_MS */)
      } finally { mock.timers.reset() }
      const matches = w.getActiveSessions().filter(s => s.id === 'sid-dedup')
      assert.equal(matches.length, 1)
    })
  })

  describe('rediscovery after restart (IT-004)', () => {
    it('rediscovers an on-disk active session with a fresh watcher instance after dispose', () => {
      seedSession(home, workspace, 'sid-restart', VALID_LINE + '\n')
      const w1 = makeWatcher()
      w1.start()
      assert.ok(w1.getActiveSessions().some(s => s.id === 'sid-restart'))
      w1.dispose()

      const w2 = makeWatcher()
      w2.start()
      assert.ok(w2.getActiveSessions().some(s => s.id === 'sid-restart'))
    })
  })

  describe('lifecycle: inactivity (IT-003)', () => {
    it('marks a session ended after INACTIVITY_TIMEOUT_MS with no new writes', () => {
      seedSession(home, workspace, 'sid-inactive', VALID_LINE + '\n')
      const w = makeWatcher()
      const lifecycle: string[] = []
      w.onSessionLifecycle(e => lifecycle.push(`${e.type}:${e.sessionId}`))

      mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
      try {
        w.start()
        assert.equal(w.isSessionActive('sid-inactive'), true)
        mock.timers.tick(INACTIVITY_TIMEOUT_MS + 1000)
        assert.equal(w.isSessionActive('sid-inactive'), false)
        assert.ok(lifecycle.includes('ended:sid-inactive'))
      } finally { mock.timers.reset() }
    })
  })

  describe('resilience: corrupt content (IT-006, UT-007)', () => {
    it('stays up on garbled content and still detects a valid sibling session', () => {
      seedSession(home, workspace, 'sid-corrupt', 'not json at all\n\x00\x01garbage\n')
      seedSession(home, workspace, 'sid-valid', VALID_LINE + '\n')
      const w = makeWatcher()
      const events: AgentEvent[] = []
      w.onEvent(e => events.push(e))
      assert.doesNotThrow(() => w.start())
      assert.equal(w.isActive(), true)
      const ids = w.getActiveSessions().map(s => s.id)
      assert.ok(ids.includes('sid-corrupt'))
      assert.ok(ids.includes('sid-valid'))
      // The valid session still parses through to a message event.
      assert.ok(events.some(e => e.sessionId === 'sid-valid' && e.type === 'message'))
      // The corrupt session gets no more than the spawn (first-valid-activity
      // fires on any parseable-or-not line reaching the parser) — no throw either way.
    })
  })

  describe('recoverable read error (IT-015)', () => {
    it('resumes emitting lines after a transient read failure', () => {
      const filePath = seedSession(home, workspace, 'sid-recover', VALID_LINE + '\n')
      const w = makeWatcher()
      const events: AgentEvent[] = []
      w.onEvent(e => events.push(e))

      // Enable mock timers before start() so the session's poll-fallback
      // interval (the mechanism that recovers from a missed fs.watch event)
      // is itself virtual and can be ticked deterministically below.
      mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
      try {
        w.start()
        assert.ok(events.some(e => e.type === 'message'))

        // Simulate a transient read error: file briefly disappears (e.g.
        // atomic rewrite by the writer), then comes back with more content.
        const backup = fs.readFileSync(filePath)
        fs.unlinkSync(filePath)
        assert.doesNotThrow(() => mock.timers.tick(POLL_FALLBACK_MS + 100))
        fs.writeFileSync(filePath, Buffer.concat([
          backup,
          Buffer.from('{"role":"assistant","message":{"content":[{"type":"text","text":"recovered"}]}}\n'),
        ]))
        mock.timers.tick(POLL_FALLBACK_MS + 100)
      } finally { mock.timers.reset() }

      assert.ok(events.some(e => e.type === 'message' && e.payload.content === 'recovered'))
    })
  })

  describe('status labeling (UT-025, UT-026, UT-027)', () => {
    it('UT-025: connection status includes a Cursor indicator and the home label', () => {
      const status = cursorConnectionStatus('/Users/example/.cursor')
      assert.match(status, /Cursor/)
      assert.ok(status.includes(cursorHomeLabel('/Users/example/.cursor')))
    })

    it('UT-026: status is not conditioned on session count (no zero-session failure wording)', () => {
      const status = cursorConnectionStatus('/Users/example/.cursor')
      assert.ok(!/fail|disconnect/i.test(status))
    })

    it('UT-027: Cursor remains distinguishable when joined with another runtime\'s status', () => {
      const combined = `Codex session watcher (~/.codex); ${cursorConnectionStatus('/Users/example/.cursor')}`
      assert.match(combined, /Cursor/)
      assert.match(combined, /Codex/)
    })

    it('cursorHomeLabel collapses the real home directory to ~', () => {
      const home2 = path.join(os.homedir(), '.cursor')
      assert.equal(cursorHomeLabel(home2), '~/.cursor')
    })
  })
})
