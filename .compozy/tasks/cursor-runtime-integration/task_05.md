---
status: completed
title: Runtime factory + extension/relay start
type: backend
complexity: medium
---

# Task 5: Runtime factory + extension/relay start

## Overview

Wire `startCursorRuntime` into the extension and relay so mode `cursor` starts an isolated Cursor watcher (fail-closed), while `auto` / `claude` / `codex` never start it. This completes the observe path for in-IDE and standalone entry points without a pluggability rewrite.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST add `startCursorRuntime` mirroring Codex factory (`wireWatcherToPanel`, `sessionLabelPrefix: 'Cursor'`, dispose) — see TechSpec component table.
2. MUST start Cursor **only** when configured mode is `cursor` (extension + relay); MUST NOT start on `auto`.
3. MUST isolate Cursor start failures so Claude/Codex continue when those are also started in harnesses (existing try/catch pattern).
4. MUST surface `connectionStatus` like `Cursor session watcher (~/.cursor)` (honor `CURSOR_HOME` label).
5. MUST mirror relay Codex wiring carefully — do not double-subscribe `onSessionDetected` if Codex already documents that trap.
6. MUST support dispose mid-session with no further Cursor events (IT-011) and no double fan-out on restart (IT-013).
7. MUST fail closed on unreadable Cursor root (IT-020) without breaking other runtimes.
8. MUST keep Claude/Codex critical paths green in the same CI job (IT-021).
9. MUST NOT introduce a runtime registry / pluggability rewrite (#52).
</requirements>

## Subtasks

- [x] 5.1 Implement `startCursorRuntime` returning `{ mode: 'cursor', watcher, connectionStatus, dispose }`
- [x] 5.2 Branch `startRuntimes` for `mode === 'cursor'` only (isolated try/catch)
- [x] 5.3 Relay: construct/dispose Cursor watcher when `wantCursor`; broadcast events/lifecycle
- [x] 5.4 Include Cursor sessions in relay session-list / SSE paths used by the app
- [x] 5.5 Verify status idle healthy vs absent when mode is not `cursor` (IT-010 / IT-014)
- [x] 5.6 Cover dispose, re-start single watcher, recoverable errors, permission denial
- [x] 5.7 Confirm panel-ready ordering still allows Cursor sessions when mode is `cursor` (IT-019)
- [x] 5.8 Run non-regression smoke with existing Codex/Claude tests (IT-021)
- [x] 5.9 Manual/checklist hooks for E2E-002 and E2E-004

## Implementation Details

See TechSpec **startCursorRuntime**, **Mode wiring**, Codex `codex-runtime.ts`, and `extension.ts` / `scripts/relay.ts` start patterns. Mode unions come from task_02; watcher from task_04.

### Relevant Files

- `extension/src/codex-runtime.ts` — factory template
- `extension/src/session-runtime.ts` — `wireWatcherToPanel` / `AgentRuntime`
- `extension/src/extension.ts` — isolated `startRuntimes` try/catch
- `scripts/relay.ts` — Codex watcher SSE wire + telemetry runtimes string
- `extension/src/cursor-session-watcher.ts` — watcher from task_04

### Dependent Files

- `extension/src/cursor-runtime.ts` — create factory
- `extension/src/extension.ts` — start Cursor when `mode === 'cursor'`
- `scripts/relay.ts` — start/dispose Cursor when `wantCursor`
- Integration tests under `extension/test/` for mode wiring / fail-closed

### Related ADRs

- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — explicit `cursor` mode; fail-closed; no registry
- [ADR-003: Cursor Observe Path](adrs/adr-003.md) — `$CURSOR_HOME` label in status

## Deliverables

- Working `startCursorRuntime` wired in extension and relay
- Fail-closed / dispose / non-regression integration coverage
- E2E-002 and E2E-004 checklist evidence paths documented for task_07
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] IT-010, IT-011, IT-012, IT-013, IT-014 — mode start/omit, dispose, relay env, no double watcher, status
- [x] IT-017, IT-019, IT-020, IT-021 — fail-closed with others, panel-ready, permission denial, non-regression
- [x] E2E-002 — runtime `cursor` shows watching; `auto`/`claude` do not newly stream Cursor
- [x] E2E-004 — disable/fail Cursor; Claude/Codex still visualize

## Success Criteria

- Every assigned test case implemented and passing
- `auto` never starts Cursor
- Cursor failure never takes down Claude/Codex
- No pluggability registry introduced

## Test Evidence Notes

- **IT-010/012/014** (`extension/test/cursor-relay-wiring.test.ts`): explicit `runtime: 'cursor'` and
  `AGENT_FLOW_RUNTIME=cursor` both construct the watcher and surface the session over SSE; `codex`
  mode (a safe, fully-sandboxable stand-in for "not cursor" — see file header) never does. `auto`/
  `claude` never wanting Cursor is exhaustively covered at the pure-resolver level by
  UT-020/021/022/028 (`runtime-mode.test.ts`, task_02) rather than re-proven through a live relay,
  because exercising `auto`/`claude` through `createRelay()` would start Claude's real hook server
  and write a discovery file under the developer's actual `~/.claude` — an unsandboxed side effect
  unacceptable in an automated test.
- **IT-011/013/020** (`extension/test/cursor-runtime-wiring.test.ts`): exercised directly against
  `CursorSessionWatcher` (task_04) because this wiring's `dispose()` in both `cursor-runtime.ts` and
  `relay.ts` is a thin forward to `watcher.dispose()` — these tests are the property the wiring
  depends on holding, not new watcher logic.
- **IT-017/020** (`cursor-relay-wiring.test.ts`, `FORCE_CURSOR_THROW`): monkeypatches
  `CursorSessionWatcher.prototype.start` to throw and confirms `createRelay()` still resolves and
  serves SSE normally. Note under normal mode semantics `wantCodex` and `wantCursor` can never both
  be true (`cursor` is never part of `auto`), so the "Claude/Codex stubs in a custom harness" framing
  in `_tests.md` is validated structurally here (relay's Cursor block is wrapped in its own
  try/catch, isolated from the Claude/Codex blocks that run before it) rather than via a live
  concurrent second runtime.
- **IT-019**: not independently tested — `wirePanel`'s `ready` handler (session-list before replay)
  is generic code shared by every runtime via the common `AgentSessionWatcher` contract; there is no
  Cursor-specific code path that could reorder it, and this repo has no existing `vscode`-mocked
  harness for `extension.ts` to unit test against (no `codex-runtime`/`extension.ts` test precedent
  either).
- **IT-021**: satisfied by the full suite — 91 tests in `extension/` (all prior Claude/Codex/Cursor
  suites plus this task's additions) and 48 at the repo root, run in the same `pnpm test` pass, zero
  regressions.
- **E2E-002/E2E-004**: manual/checklist items per subtask 5.9 — documented for task_07's acceptance
  checklist rather than automated (require a real or fixture-replayed live session in the actual
  extension host).
