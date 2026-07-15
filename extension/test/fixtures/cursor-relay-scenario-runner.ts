/**
 * Standalone scenario runner spawned as a child process by
 * cursor-runtime-wiring.test.ts. `createRelay()` guards against being called
 * more than once per process (`relayCreated`), so each mode/env scenario
 * needs its own fresh process — this script is that process.
 *
 * Usage: node --import tsx cursor-relay-scenario-runner.ts <workspace> [runtimeOption]
 * Env:
 *   CURSOR_HOME          — passed straight through to CursorSessionWatcher
 *   AGENT_FLOW_RUNTIME    — read by resolveRuntimeMode() when no explicit arg
 *   FORCE_CURSOR_THROW    — if "1", CursorSessionWatcher.prototype.start throws
 *
 * Prints one JSON line to stdout: { ok: true, chunks: string[] } on success,
 * or { ok: false, error: string } if createRelay() itself threw/rejected.
 */

import { createRelay, RelayRuntimeMode } from '../../../scripts/relay'
import { CursorSessionWatcher } from '../../src/cursor-session-watcher'

async function main(): Promise<void> {
  const [, , workspace, runtimeArg] = process.argv

  if (process.env.FORCE_CURSOR_THROW === '1') {
    CursorSessionWatcher.prototype.start = () => {
      throw new Error('forced failure for test')
    }
  }

  const chunks: string[] = []
  const fakeRes = {
    writeHead: () => {},
    write: (chunk: string) => { chunks.push(chunk); return true },
  } as unknown as import('http').ServerResponse
  const fakeReq = { on: () => {} } as unknown as import('http').IncomingMessage

  try {
    const relay = await createRelay({
      workspace,
      runtime: (runtimeArg || undefined) as RelayRuntimeMode | undefined,
    })
    relay.handleSSE(fakeReq, fakeRes)
    relay.dispose()
    process.stdout.write(JSON.stringify({ ok: true, chunks }) + '\n')
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + '\n')
  }
}

main()
