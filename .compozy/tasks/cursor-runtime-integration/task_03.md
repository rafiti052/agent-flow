---
status: completed
title: Cursor transcript parser
type: backend
complexity: medium
---

# Task 3: Cursor transcript parser

## Overview

Implement a Codex-shaped `CursorTranscriptParser` that turns main-session Cursor JSONL lines into existing `AgentEvent`s: one orchestrator `agent_spawn` with `runtime: 'cursor'` plus best-effort `message` events. This enables attach visualization without tools, hierarchy, or inventing agents.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST implement `CursorTranscriptParser` + local parse state/delegate mirroring Codex style (see TechSpec Core Interfaces).
2. MUST emit exactly one main `agent_spawn` on first valid activity with `payload.runtime === 'cursor'` and `payload.name === ORCHESTRATOR_NAME`.
3. MUST map text-bearing user/assistant content to `message` events with roles, truncating to `MESSAGE_MAX`.
4. MUST skip non-JSON and unknown top-level shapes without throwing; subsequent valid lines MUST still emit.
5. MUST NOT emit `tool_call_*`, `model_detected`, `context_update`, `subagent_dispatch`, or any hierarchy events (ADR-006).
6. MUST dedupe repeated message lines via `seenMessageHashes` (or equivalent).
7. MUST NOT invent prose from `[REDACTED]` / thinking-only segments — skip or pass through literally.
8. MUST preserve non-decreasing processing order for events from lines 1..N for that agent.
9. SHOULD drive tests from task_01 fixtures under `extension/test/fixtures/cursor/`.
</requirements>

## Subtasks

- [x] 3.1 Define `CursorParseState`, `CursorParserDelegate`, and parser class/module
- [x] 3.2 Implement one-shot main spawn with `runtime: 'cursor'` and orchestrator name
- [x] 3.3 Map user text content → `message` with `role: 'user'`
- [x] 3.4 Map assistant text content → `message` with `role: 'assistant'`
- [x] 3.5 Truncate oversized text to `MESSAGE_MAX`
- [x] 3.6 Skip malformed / unknown shapes without throw
- [x] 3.7 Dedup messages; assert no `subagent_dispatch` on empty/minimal trails
- [x] 3.8 Cover all assigned parser unit tests against fixtures

## Implementation Details

See TechSpec **CursorTranscriptParser**, **Event mapping** (spawn + messages only), and Codex `codex-rollout-parser.ts` for delegate/`processLine` patterns. Reuse `MESSAGE_MAX` and `ORCHESTRATOR_NAME` from `constants.ts`. Do not watch files or wire the panel in this task.

### Relevant Files

- `extension/src/codex-rollout-parser.ts` — delegate / spawn-once / hash / truncate pattern
- `extension/src/constants.ts` — `MESSAGE_MAX`, `ORCHESTRATOR_NAME`
- `extension/src/protocol.ts` — `AgentEvent` types
- `extension/test/fixtures/cursor/` — fixtures from task_01
- `extension/test/codex-rollout-parser.test.ts` — test harness to mirror

### Dependent Files

- `extension/src/cursor-transcript-parser.ts` — create parser
- `extension/test/cursor-transcript-parser.test.ts` — create unit tests

### Related ADRs

- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — spawn + messages only; no tools/hierarchy

## Deliverables

- `CursorTranscriptParser` module ready for watcher integration
- Fixture-backed unit suite for spawn, messages, and resilience
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] UT-007, UT-008, UT-061, UT-062, UT-063 — resilience, empty trail, spawn, unknown shape, dedup
- [x] UT-040, UT-041, UT-045, UT-047, UT-048 — user/assistant messages, truncation, redacted, ordering

## Success Criteria

- Every assigned test case implemented and passing
- No tool/hierarchy/context events emitted from V1 fixtures
- Spawn always carries `runtime: 'cursor'`
