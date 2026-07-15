---
status: completed
title: Cursor session watcher
type: backend
complexity: medium
---

# Task 4: Cursor session watcher

## Overview

Implement `CursorSessionWatcher` that discovers and tails workspace-matched Cursor main transcripts under `$CURSOR_HOME/projects/<encoded>/agent-transcripts/`, emitting parser events through the shared `AgentSessionWatcher` contract. This delivers US-001 discovery without hierarchy or `subagents/` watching.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST implement `CursorSessionWatcher` against `AgentSessionWatcher` (see TechSpec component table).
2. MUST watch only `$CURSOR_HOME/projects/<exact-encoded>/agent-transcripts/<sid>/<sid>.jsonl` (ADR-003 / ADR-006).
3. MUST use `encodeCursorProjectPath` from task_01 and `CursorTranscriptParser` from task_03.
4. MUST reuse Codex activity constants (`SCAN_INTERVAL_MS`, `ACTIVE_SESSION_AGE_S`, `INACTIVITY_TIMEOUT_MS`, `POLL_FALLBACK_MS`).
5. MUST treat missing root/project as idle healthy (empty sessions, watcher still active) — not a hard fail.
6. MUST NOT scan sibling projects, case-fold, or watch `subagents/`.
7. MUST coalesce duplicate discovery of the same session id to one `SessionInfo`.
8. MUST drop stale inactive sessions per activity/inactivity rules (UT-004 / IT-003).
9. MUST expose Cursor-distinguishable watch/status strings usable for connection status (UT-025–027) — e.g. include `Cursor` and home label.
10. SHOULD support injectable `CURSOR_HOME` for temp-dir integration tests.
</requirements>

## Subtasks

- [x] 4.1 Resolve Cursor home (`CURSOR_HOME` or `~/.cursor`) and exact project transcripts root
- [x] 4.2 Scan/discover recently active main `<sid>/<sid>.jsonl` files only
- [x] 4.3 Attach: drain existing lines, `fs.watch` + poll fallback, inactivity lifecycle
- [x] 4.4 Feed new lines through `CursorTranscriptParser` with `sessionId`
- [x] 4.5 Implement full watcher API used by panel/relay (`getActiveSessions`, lifecycle, replay hooks as Codex does)
- [x] 4.6 Exclude other projects’ sessions (IT-002)
- [x] 4.7 Survive corrupt content without taking the watcher down (IT-006)
- [x] 4.8 Provide status/home labeling for UT-025–027
- [x] 4.9 Temp-`$CURSOR_HOME` integration coverage for IT-001–006 / IT-015

## Implementation Details

See TechSpec **CursorSessionWatcher**, **Integration Points**, and Codex `codex-session-watcher.ts` for discover/tail/lifecycle. Path layout is under TechSpec Data Models. Do not implement `startCursorRuntime` or mode wiring here (task_05).

### Relevant Files

- `extension/src/codex-session-watcher.ts` — primary mirror for discovery/tail/lifecycle
- `extension/src/fs-utils.ts` — `readNewFileLines` tail reassembly
- `extension/src/constants.ts` — activity / poll / scan constants
- `extension/src/session-runtime.ts` — `AgentSessionWatcher` contract
- `extension/src/typed-event-emitter.ts` — vscode-free events for relay
- `extension/src/cursor-path.ts` — encoder from task_01
- `extension/src/cursor-transcript-parser.ts` — parser from task_03

### Dependent Files

- `extension/src/cursor-session-watcher.ts` — create watcher
- `extension/test/cursor-session-watcher.test.ts` — create unit/integration tests with temp home

### Related ADRs

- [ADR-003: Cursor Observe Path](adrs/adr-003.md) — encoded project dir + activity windows
- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — main attach only; exact match; no `subagents/`

## Deliverables

- `CursorSessionWatcher` implementing the shared watcher contract
- Temp-home tests for discovery, exclusion, lifecycle, and resilience
- Status strings distinguishable as Cursor
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] UT-002, UT-004, UT-005, UT-006 — discovery, inactivity, idempotent session id, empty idle healthy
- [x] UT-025, UT-026, UT-027 — Cursor watch status / idle ≠ failed / distinguishable when joined
- [x] IT-001, IT-002, IT-003, IT-004, IT-005, IT-006 — temp-home discovery, exclusion, lifecycle, rediscover, dedup, corrupt resilience
- [x] IT-015 — recoverable read error then subsequent lines emit again

## Success Criteria

- Every assigned test case implemented and passing
- No `subagents/` watching or hierarchy events
- Missing project → idle healthy, not Cursor-failed-by-default
