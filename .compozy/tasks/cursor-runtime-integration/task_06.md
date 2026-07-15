---
status: completed
title: Web CURSOR labels & brand non-fallthrough
type: frontend
complexity: medium
---

# Task 6: Web CURSOR labels & brand non-fallthrough

## Overview

Teach the shared web visualizer that `runtime: 'cursor'` is a first-class discriminator: panels/bubbles show `CURSOR` text, and canvas branding must never fall through to Claude or Codex logos. This satisfies US-005 under ADR-006 without a Cursor-specific layout or custom glyph asset.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST extend web runtime unions with `'cursor'` (`web/lib/agent-types.ts` and related).
2. MUST set agent runtime from spawn when `payload.runtime === 'cursor'` (today non-codex becomes `undefined` → Claude branding — MUST fix).
3. MUST resolve assistant/transcript/bubble labels to `CURSOR` (not `CLAUDE`/`CODEX`) when runtime is `cursor`.
4. MUST update `drawAgentBrand` so `'cursor'` does **not** choose Claude spark or Codex/OpenAI mark (skip brand / non-logo branch) — UT-035 / ADR-006.
5. MUST fix `sessionRuntime` derivation in the visualizer index so Cursor sessions are not forced to Claude labels.
6. MUST keep mixed-runtime lists correctly labeled (codex vs cursor) — UT-033.
7. MUST NOT add a custom Cursor glyph asset or Cursor-only canvas chrome.
8. SHOULD extract pure label/brand selectors if needed so UT-030–035 can unit-test without canvas harness.
</requirements>

## Subtasks

- [x] 6.1 Extend `Agent.runtime` union with `'cursor'`
- [x] 6.2 Fix spawn handling in `handle-agent-events` for `runtime === 'cursor'`
- [x] 6.3 Update bubble / chat / transcript / message-feed label ternaries to include `CURSOR`
- [x] 6.4 Fix `drawAgentBrand` non-fallthrough for cursor
- [x] 6.5 Fix `sessionRuntime` memo to recognize cursor
- [x] 6.6 Ensure missing discriminator on Cursor spawn path under test always sets `runtime: 'cursor'` (UT-032 coordination with parser)
- [x] 6.7 Unit-test UT-030–033 / UT-035

## Implementation Details

See TechSpec **Web runtime presentation**. Critical current fallthrough:

```typescript
// handle-agent-events.ts
const runtime = payload.runtime === 'codex' ? 'codex' as const : undefined
// draw-agents.ts drawAgentBrand: codex → OpenAI, else Claude spark
```

Depends only on task_02 for the mode/discriminator contract; can run in parallel with parser/watcher/factory. Full-stack E2E-001 is owned by task_07 after this lands.

### Relevant Files

- `web/lib/agent-types.ts` — runtime union
- `web/hooks/simulation/handle-agent-events.ts` — spawn runtime mapping
- `web/components/agent-visualizer/canvas/draw-agents.ts` — `drawAgentBrand`
- `web/components/agent-visualizer/canvas/draw-bubbles.ts` — bubble labels
- `web/components/agent-visualizer/chat-panel.tsx` — assistant label
- `web/components/agent-visualizer/session-transcript-panel.tsx` — assistant label
- `web/components/agent-visualizer/message-feed-panel.tsx` — CODEX override
- `web/components/agent-visualizer/index.tsx` — `sessionRuntime` memo

### Dependent Files

- All Relevant Files above — modify for `'cursor'` / `CURSOR` / non-fallthrough
- Optional pure helper module + unit test file under `web/` if extracted for UT coverage

### Related ADRs

- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — text `CURSOR`; no custom glyph; no logo fallthrough

## Deliverables

- Web runtime discriminator and labels for Cursor
- Brand path that never paints Claude/Codex logos for cursor agents
- Unit tests for assigned presentation cases
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] UT-030, UT-031, UT-032, UT-033, UT-035 — runtime field, `CURSOR` label, spawn discriminator, mixed labels, brand non-fallthrough

## Success Criteria

- Every assigned test case implemented and passing
- Cursor agents never appear Claude-branded by fallthrough
- No Cursor-specific canvas layout or glyph asset added
