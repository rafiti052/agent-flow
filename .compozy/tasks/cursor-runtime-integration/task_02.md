---
status: completed
title: Mode unions & config surfaces
type: backend
complexity: low
---

# Task 2: Mode unions & config surfaces

## Overview

Extend Agent Flow’s runtime mode unions and config/env resolvers so `cursor` is a first-class selectable mode, while `auto` remains Claude+Codex only. This unlocks parallel work on web labels and later factory wiring without starting a Cursor watcher yet.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST extend `AgentRuntimeMode` with `'cursor'` (see TechSpec Core Interfaces).
2. MUST add `cursor` to `agentVisualizer.runtime` enum (and descriptions/keywords) in `extension/package.json`.
3. MUST accept `cursor` in extension `readConfiguredMode` and relay `resolveRuntimeMode` / `AGENT_FLOW_RUNTIME`.
4. MUST define want-Cursor semantics as `mode === 'cursor'` only — MUST NOT start or want Cursor when mode is `auto` (ADR-006).
5. MUST leave Claude/Codex `auto` branches behaviorally unchanged.
6. MUST map unknown/invalid runtime strings to the documented safe default (`auto` without Cursor) — UT-021.
7. SHOULD extract a small pure resolver helper if needed so UT-020–022 can run without VS Code host or watcher.
8. MUST NOT construct `CursorSessionWatcher` / `startCursorRuntime` in this task (task_05 owns start).
</requirements>

## Subtasks

- [x] 2.1 Extend `AgentRuntimeMode` with `'cursor'`
- [x] 2.2 Add package.json enum value, enumDescriptions, and keyword for Cursor
- [x] 2.3 Update `readConfiguredMode` to return `'cursor'` when configured
- [x] 2.4 Update relay `RelayRuntimeMode` + `resolveRuntimeMode` for `cursor`
- [x] 2.5 Encode `wantCursor = mode === 'cursor'` (false for `auto` / `claude` / `codex`)
- [x] 2.6 Keep Claude/Codex want flags identical for `auto`
- [x] 2.7 Add unit tests for UT-020 / UT-021 / UT-022
- [x] 2.8 Guard against accidental Cursor start until task_05 (no-op or absent branch)

## Implementation Details

See TechSpec **Config**, **Mode semantics**, and **Build Order** step 4 (config portion only). Today’s pattern:

```typescript
// extension.ts — only claude|codex accepted; else auto
return raw === 'claude' || raw === 'codex' ? raw : 'auto'
```

Relay currently: `wantCodex = mode === 'codex' || mode === 'auto'`. Cursor must **not** mirror that OR-with-auto pattern.

### Relevant Files

- `extension/src/session-runtime.ts` — `AgentRuntimeMode` union
- `extension/src/extension.ts` — `readConfiguredMode` / `startRuntimes`
- `extension/package.json` — `agentVisualizer.runtime` enum
- `scripts/relay.ts` — `resolveRuntimeMode`, `wantClaude` / `wantCodex`

### Dependent Files

- `extension/src/session-runtime.ts` — modify mode union
- `extension/src/extension.ts` — modify mode reader (start branch optional no-op)
- `extension/package.json` — modify enum / descriptions
- `scripts/relay.ts` — modify resolver + `wantCursor` flag (no watcher construct yet)
- `extension/test/*mode*.test.ts` (or similar) — create resolver unit tests

### Related ADRs

- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — Cursor mode only; not in `auto`

## Deliverables

- `'cursor'` present on all documented mode surfaces
- Pure/resolvable want-Cursor semantics covered by unit tests
- Claude/Codex `auto` behavior unchanged
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] UT-020, UT-021, UT-022 — mode resolver: `cursor` only, unknown → safe default, `AGENT_FLOW_RUNTIME=cursor`
- [x] UT-028 — `auto` / `claude` do not want/start Cursor (resolver / factory-not-invoked assertion at this layer)

## Success Criteria

- Every assigned test case implemented and passing
- `auto` never wants Cursor
- Config/env surfaces document `cursor` without requiring watcher implementation
