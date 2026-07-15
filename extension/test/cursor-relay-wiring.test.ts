/**
 * End-to-end mode-gating coverage for scripts/relay.ts's Cursor wiring
 * (task_05, IT-010/012/014/017/020).
 *
 * createRelay() throws if called more than once in the same process
 * (`relayCreated` guard), so each scenario below runs in its own child
 * process via cursor-relay-scenario-runner.ts. That runner builds a relay,
 * makes one handleSSE() call against a fake response object, disposes, and
 * prints the captured SSE chunks as JSON — enough to see whether the Cursor
 * session made it into the session-list.
 *
 * `auto`/`claude` are deliberately not exercised here: they start Claude's
 * hook server and write a discovery file under the real `~/.claude`, which
 * would be an unsandboxed side effect from an automated test. That mode
 * never wanting Cursor is already exhaustively covered at the pure-resolver
 * level by UT-020/UT-021/UT-022/UT-028 (runtime-mode.test.ts); `codex` mode
 * stands in here as a safe, fully-sandboxable "not cursor" case that still
 * exercises the real `wantCursor` gate inside createRelay() at runtime.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeCursorProjectPath } from '../src/cursor-path'

const RUNNER = path.join(__dirname, 'fixtures', 'cursor-relay-scenario-runner.ts')
// scripts/relay.ts pulls in extension/src/hook-server.ts, which imports the
// real `vscode` module (only resolvable inside the extension host). The dev
// relay build aliases that import to scripts/vscode-shim.js via esbuild
// (scripts/build-relay.js); un-bundled here, we get the same effect via
// NODE_PATH pointing at a `vscode.js` that re-exports the same shim.
const VSCODE_SHIM_NODE_PATH = path.join(__dirname, 'fixtures', 'vscode-shim')
const VALID_LINE = '{"role":"user","message":{"content":[{"type":"text","text":"hello from cursor"}]}}'
const SESSION_ID = 'sid-relay-wiring'

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
  const args = [RUNNER, opts.workspace, ...(opts.runtimeArg ? [opts.runtimeArg] : [])]
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
    const dir = path.join(cursorHome, 'projects', encodeCursorProjectPath(workspace), 'agent-transcripts', SESSION_ID)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${SESSION_ID}.jsonl`), VALID_LINE + '\n')
  })

  after(() => {
    fs.rmSync(cursorHome, { recursive: true, force: true })
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('IT-010/IT-014: explicit `cursor` mode constructs the watcher and lists the session', () => {
    const result = runScenario({ workspace, cursorHome, runtimeArg: 'cursor' })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(joined.includes(SESSION_ID), 'expected the Cursor session id in the SSE session-list')
  })

  it('IT-012: `AGENT_FLOW_RUNTIME=cursor` (no explicit option) constructs the watcher too', () => {
    const result = runScenario({ workspace, cursorHome, env: { AGENT_FLOW_RUNTIME: 'cursor' } })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(joined.includes(SESSION_ID), 'expected the Cursor session id via env-driven mode resolution')
  })

  it('IT-010/IT-014: non-cursor mode (`codex`) never lists the Cursor session', () => {
    const result = runScenario({ workspace, cursorHome, runtimeArg: 'codex' })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(!joined.includes(SESSION_ID), 'Cursor session must not appear when mode is not `cursor`')
  })

  it('IT-017/IT-020: a throwing Cursor watcher fails closed — createRelay still succeeds', () => {
    const result = runScenario({
      workspace, cursorHome, runtimeArg: 'cursor',
      env: { FORCE_CURSOR_THROW: '1' },
    })
    assert.equal(result.ok, true, result.error)
    const joined = (result.chunks ?? []).join('\n')
    assert.ok(!joined.includes(SESSION_ID), 'watcher never started, so no session to list')
  })
})
