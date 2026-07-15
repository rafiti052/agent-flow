/**
 * Wiring-layer coverage for task_05 (startCursorRuntime + extension/relay
 * start): dispose semantics, restart fan-out, and fail-closed behavior on an
 * unreadable Cursor root. These properties are guaranteed by
 * CursorSessionWatcher itself (task_04) but are exercised here directly
 * because task_05's wiring (`cursor-runtime.ts`, `scripts/relay.ts`) depends
 * on them holding — `dispose()` in both call sites just forwards to
 * `watcher.dispose()`, so a leak here would silently break the wiring's
 * fail-closed/no-double-fan-out guarantees.
 *
 * Cross-process wiring (mode gating end-to-end through `createRelay`) is
 * covered in `cursor-relay-wiring.test.ts`.
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CursorSessionWatcher } from '../src/cursor-session-watcher'
import { encodeCursorProjectPath } from '../src/cursor-path'
import { POLL_FALLBACK_MS } from '../src/constants'
import type { AgentEvent } from '../src/protocol'

const VALID_LINE = '{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}'
const NEXT_LINE = '{"role":"assistant","message":{"content":[{"type":"text","text":"hi there"}]}}'

function seedSession(home: string, workspace: string, sessionId: string, content: string): string {
  const dir = path.join(home, 'projects', encodeCursorProjectPath(workspace), 'agent-transcripts', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${sessionId}.jsonl`)
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('Cursor runtime wiring (task_05)', () => {
  let home: string
  let workspace: string
  const watchers: CursorSessionWatcher[] = []

  before(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-wiring-home-'))
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-wiring-ws-'))
  })

  after(() => {
    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  afterEach(() => {
    for (const w of watchers.splice(0)) w.dispose()
  })

  function makeWatcher(): CursorSessionWatcher {
    const w = new CursorSessionWatcher(workspace, home)
    watchers.push(w)
    return w
  }

  describe('dispose mid-session (IT-011)', () => {
    it('emits no further events after dispose, even when the file changes again', async () => {
      const filePath = seedSession(home, workspace, 'sid-dispose', VALID_LINE + '\n')
      const w = makeWatcher()
      const events: AgentEvent[] = []
      w.onEvent(e => events.push(e))
      w.start()
      const countAfterAttach = events.length
      assert.ok(countAfterAttach > 0, 'expected the initial spawn/message events on attach')

      w.dispose()
      // dispose() closes the fs.watch handle and clears the poll timer — a
      // write after dispose must not reach the (now-torn-down) listener.
      // Wait past POLL_FALLBACK_MS so a leaked poll timer (not just a leaked
      // fs.watch handle) would also have a chance to wrongly fire.
      fs.appendFileSync(filePath, NEXT_LINE + '\n')
      await new Promise(resolve => setTimeout(resolve, POLL_FALLBACK_MS + 200))
      assert.equal(events.length, countAfterAttach, 'no events should arrive after dispose()')
    })
  })

  describe('restart — no double fan-out (IT-013)', () => {
    it('a fresh watcher instance after dispose emits each line exactly once', async () => {
      const filePath = seedSession(home, workspace, 'sid-restart', VALID_LINE + '\n')

      const first = makeWatcher()
      const firstEvents: AgentEvent[] = []
      first.onEvent(e => firstEvents.push(e))
      first.start()
      assert.ok(firstEvents.length > 0)
      first.dispose()

      const second = makeWatcher()
      const secondEvents: AgentEvent[] = []
      second.onEvent(e => secondEvents.push(e))
      second.start()

      const beforeAppend = secondEvents.length
      fs.appendFileSync(filePath, NEXT_LINE + '\n')
      // fs.watch fires asynchronously (near-instant locally, but not
      // guaranteed) — poll past POLL_FALLBACK_MS so the watcher's own poll
      // fallback is guaranteed to have run at least once even if fs.watch
      // coalesces or misses the event on this filesystem.
      const deadline = Date.now() + POLL_FALLBACK_MS + 500
      while (secondEvents.length === beforeAppend && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }

      const messageEvents = secondEvents.slice(beforeAppend).filter(e => e.type === 'message')
      assert.ok(messageEvents.length >= 1, 'the new line should still produce a message event')
      assert.equal(
        messageEvents.filter(e => (e.payload as { content?: string }).content?.includes('hi there')).length,
        1,
        'exactly one event for the new line — a leaked first-instance listener would double it',
      )
    })
  })

  describe('unreadable Cursor root — fail closed (IT-020)', () => {
    it('stays idle-healthy (no throw, zero sessions) when the transcripts root is unreadable', (t) => {
      if (process.platform === 'win32') {
        t.skip('POSIX permission bits not meaningful on Windows')
        return
      }
      const dir = path.join(home, 'projects', encodeCursorProjectPath(workspace), 'agent-transcripts')
      fs.mkdirSync(dir, { recursive: true })
      fs.chmodSync(dir, 0o000)
      try {
        const w = makeWatcher()
        assert.doesNotThrow(() => w.start())
        assert.equal(w.isActive(), true)
        assert.deepEqual(w.getActiveSessions(), [])
      } finally {
        fs.chmodSync(dir, 0o755)
      }
    })
  })
})
