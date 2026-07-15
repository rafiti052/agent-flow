/**
 * Wiring-layer coverage for startCursorRuntime + extension/relay start:
 * dispose semantics, restart fan-out, and fail-closed behavior on an
 * unreadable Cursor root, plus end-to-end mode-gating through
 * `scripts/relay.ts`'s `createRelay()`.
 *
 * Two process boundaries are exercised here: in-process
 * (`CursorSessionWatcher` directly) for dispose/restart/unreadable-root
 * behavior, and cross-process (via `cursor-relay-scenario-runner.ts`) for
 * `createRelay()`'s actual `wantCursor` wiring end-to-end — since
 * `createRelay()` throws if called more than once per process, each
 * mode-gating scenario needs its own fresh process.
 *
 * `auto`/`claude` are deliberately not exercised in the cross-process
 * scenarios: they start Claude's hook server and write a discovery file
 * under the real `~/.claude`, which would be an unsandboxed side effect from
 * an automated test. `codex` mode stands in as a safe, fully sandboxable
 * "not cursor" case that still exercises the real `wantCursor` gate.
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

describe('Cursor runtime wiring', () => {
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

  describe('dispose mid-session', () => {
    it('emits no further events after dispose, even when the file changes again', async () => {
      const filePath = seedSession(home, workspace, 'sid-dispose', VALID_LINE + '\n')
      const w = makeWatcher()
      const events: AgentEvent[] = []
      w.onEvent(e => events.push(e))
      w.start()
      const countAfterAttach = events.length
      assert.ok(countAfterAttach > 0, 'expected the initial spawn/message events on attach')

      w.dispose()
      // dispose() clears both the fs.watch handle and the poll timer; wait
      // past POLL_FALLBACK_MS so a leaked poll timer would also have a
      // chance to wrongly fire.
      fs.appendFileSync(filePath, NEXT_LINE + '\n')
      await new Promise(resolve => setTimeout(resolve, POLL_FALLBACK_MS + 200))
      assert.equal(events.length, countAfterAttach, 'no events should arrive after dispose()')
    })
  })

  describe('restart — no double fan-out', () => {
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
      // fs.watch fires asynchronously and isn't guaranteed on every FS —
      // poll past POLL_FALLBACK_MS so the watcher's poll fallback has run
      // at least once even if fs.watch misses the event.
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

  describe('unreadable Cursor root — fail closed', () => {
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
// scripts/relay.ts imports the real `vscode` module via hook-server.ts, only
// resolvable inside the extension host; NODE_PATH points at a shim
// `vscode.js` here, mirroring the esbuild alias the real dev-relay build uses.
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

describe('Cursor relay wiring — mode gating end-to-end', () => {
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

  it('explicit `cursor` mode constructs the watcher and lists the session', () => {
    const result = runScenario({ workspace, cursorHome, runtimeArg: 'cursor' })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(joined.includes(RELAY_SESSION_ID), 'expected the Cursor session id in the SSE session-list')
  })

  it('`AGENT_FLOW_RUNTIME=cursor` (no explicit option) constructs the watcher too', () => {
    const result = runScenario({ workspace, cursorHome, env: { AGENT_FLOW_RUNTIME: 'cursor' } })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(joined.includes(RELAY_SESSION_ID), 'expected the Cursor session id via env-driven mode resolution')
  })

  it('non-cursor mode (`codex`) never lists the Cursor session', () => {
    const result = runScenario({ workspace, cursorHome, runtimeArg: 'codex' })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(!joined.includes(RELAY_SESSION_ID), 'Cursor session must not appear when mode is not `cursor`')
  })

  it('a throwing Cursor watcher fails closed — createRelay still succeeds', () => {
    const result = runScenario({
      workspace, cursorHome, runtimeArg: 'cursor',
      env: { FORCE_CURSOR_THROW: '1' },
    })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(!joined.includes(RELAY_SESSION_ID), 'watcher never started, so no session to list')
  })
})
