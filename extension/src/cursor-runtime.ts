/**
 * Cursor runtime.
 *
 * Mirrors codex-runtime.ts: wires CursorSessionWatcher to the visualizer
 * panel and reports a connection status reflecting the watch root. Started
 * only when the configured mode is `cursor`, never as part of `auto` —
 * see runtime-mode.ts.
 */

import * as vscode from 'vscode'
import { CursorSessionWatcher, cursorConnectionStatus } from './cursor-session-watcher'
import { createLogger } from './logger'
import { wireWatcherToPanel } from './session-runtime'
import type { AgentRuntime } from './session-runtime'

const log = createLogger('CursorRuntime')

export function startCursorRuntime(context: vscode.ExtensionContext): AgentRuntime {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null
  const watcher = new CursorSessionWatcher(workspace)
  context.subscriptions.push(watcher)

  const wiring = wireWatcherToPanel(watcher, {
    sessionLabelPrefix: 'Cursor',
  })

  watcher.start()

  const connectionStatus = (): string => cursorConnectionStatus(watcher.home)

  const dispose = (): void => { wiring.dispose(); watcher.dispose() }

  log.info(`Cursor runtime started (home: ${watcher.home})`)

  return { mode: 'cursor', watcher, connectionStatus, dispose }
}
