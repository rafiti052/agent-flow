/**
 * Wiring-layer coverage for task_05 (startCursorRuntime + extension/relay
 * start): dispose semantics, restart fan-out, and fail-closed behavior on an
 * unreadable Cursor root, plus end-to-end mode-gating through
 * `scripts/relay.ts`'s `createRelay()` (IT-010/012/014/017/020).
 *
 * Two process boundaries are exercised in this one file because they cover
 * genuinely different failure surfaces, not the same ground twice:
 *   - In-process (`CursorSessionWatcher` directly): dispose/restart/
 *     unreadable-root behavior guaranteed by the watcher itself (task_04),
 *     which `cursor-runtime.ts` and `scripts/relay.ts` both depend on via a
 *     thin `dispose()` passthrough — a leak here would silently break the
 *     wiring's fail-closed/no-double-fan-out guarantees.
 *   - Cross-process (via `cursor-relay-scenario-runner.ts`): `createRelay()`
 *     throws if called more than once per process (`relayCreated` guard), so
 *     each mode-gating scenario needs its own fresh process. This verifies
 *     `scripts/relay.ts`'s actual `wantCursor` wiring end-to-end (explicit
 *     mode, env-var mode, negative/non-cursor mode, and fail-closed on a
 *     throwing watcher) — behavior the pure resolver tests in
 *     `runtime-mode.test.ts` don't reach, since they never touch `createRelay`.
 *
 * `auto`/`claude` are deliberately not exercised in the cross-process
 * scenarios: they start Claude's hook server and write a discovery file
 * under the real `~/.claude`, which would be an unsandboxed side effect from
 * an automated test. That mode never wanting Cursor is already exhaustively
 * covered at the pure-resolver level by UT-020/UT-021/UT-022/UT-028
 * (runtime-mode.test.ts); `codex` mode stands in here as a safe, fully
 * sandboxable "not cursor" case that still exercises the real `wantCursor`
 * gate inside createRelay() at runtime.
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CursorSessionWatcher } from '../src/cursor-session-watcher'
import { encodeCursorProjectPath } from '../src/cursor-path'
import { POLL_FALLBACK_MS } from '../src/constants'
import type { AgentEvent } from '../src/protocol'
import { seedSession } from './fixtures/cursor-test-helpers'

const VALID_LINE = '{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}'
const NEXT_LINE = '{"role":"assistant","message":{"content":[{"type":"text","text":"hi there"}]}}'

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

// ─── Cross-process: mode gating end-to-end through createRelay() ──────────

const RELAY_RUNNER = path.join(__dirname, 'fixtures', 'cursor-relay-scenario-runner.ts')
// scripts/relay.ts pulls in extension/src/hook-server.ts, which imports the
// real `vscode` module (only resolvable inside the extension host). The dev
// relay build aliases that import to scripts/vscode-shim.js via esbuild
// (scripts/build-relay.js); un-bundled here, we get the same effect via
// NODE_PATH pointing at a `vscode.js` that re-exports the same shim.
const VSCODE_SHIM_NODE_PATH = path.join(__dirname, 'fixtures', 'vscode-shim')
const RELAY_VALID_LINE = '{"role":"user","message":{"content":[{"type":"text","text":"hello from cursor"}]}}'
const RELAY_SESSION_ID = 'sid-relay-wiring'

interface ScenarioResult {
  ok: boolean
  error?: string
  chunks?: string[]
}

function runScenario(opts: {
  workspace: string
  cursorHome: string
  runtimeArg?: string
  env?: NodeJS.ProcessEnv
}): ScenarioResult {
  const args = [RELAY_RUNNER, opts.workspace, ...(opts.runtimeArg ? [opts.runtimeArg] : [])]
  const stdout = execFileSync('node', ['--import', 'tsx', ...args], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_PATH: VSCODE_SHIM_NODE_PATH,
      CURSOR_HOME: opts.cursorHome,
      AGENT_FLOW_RUNTIME: '',
      ...opts.env,
    },
    encoding: 'utf-8',
    timeout: 15_000,
  })
  const lastLine = stdout.trim().split('\n').pop() ?? '{}'
  return JSON.parse(lastLine)
}

describe('Cursor relay wiring — mode gating end-to-end (task_05)', () => {
  let cursorHome: string
  let workspace: string

  before(() => {
    cursorHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-relay-home-'))
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-flow-cursor-relay-ws-'))
    const dir = path.join(cursorHome, 'projects', encodeCursorProjectPath(workspace), 'agent-transcripts', RELAY_SESSION_ID)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${RELAY_SESSION_ID}.jsonl`), RELAY_VALID_LINE + '\n')
  })

  after(() => {
    fs.rmSync(cursorHome, { recursive: true, force: true })
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('IT-010/IT-014: explicit `cursor` mode constructs the watcher and lists the session', () => {
    const result = runScenario({ workspace, cursorHome, runtimeArg: 'cursor' })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(joined.includes(RELAY_SESSION_ID), 'expected the Cursor session id in the SSE session-list')
  })

  it('IT-012: `AGENT_FLOW_RUNTIME=cursor` (no explicit option) constructs the watcher too', () => {
    const result = runScenario({ workspace, cursorHome, env: { AGENT_FLOW_RUNTIME: 'cursor' } })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(joined.includes(RELAY_SESSION_ID), 'expected the Cursor session id via env-driven mode resolution')
  })

  it('IT-010/IT-014: non-cursor mode (`codex`) never lists the Cursor session', () => {
    const result = runScenario({ workspace, cursorHome, runtimeArg: 'codex' })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(!joined.includes(RELAY_SESSION_ID), 'Cursor session must not appear when mode is not `cursor`')
  })

  it('IT-017/IT-020: a throwing Cursor watcher fails closed — createRelay still succeeds', () => {
    const result = runScenario({
      workspace, cursorHome, runtimeArg: 'cursor',
      env: { FORCE_CURSOR_THROW: '1' },
    })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(!joined.includes(RELAY_SESSION_ID), 'watcher never started, so no session to list')
  })
})
