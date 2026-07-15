---
status: completed
title: Path encoder + main fixtures
type: backend
complexity: low
---

# Task 1: Path encoder + main fixtures

## Overview

Deliver the Cursor project-path encoder and a redacted main-session JSONL fixture corpus so later parser and watcher work can lock against real on-disk shapes without a live Cursor install. This is the foundation for workspace-scoped discovery (ADR-003 / ADR-006).

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST implement `encodeCursorProjectPath` that maps an absolute workspace `fsPath` to Cursor’s project directory name per TechSpec Data Models / ADR-003 (drop leading separators; replace `/` and whitespace with `-`).
2. MUST NOT use Claude’s `replace(/[^a-zA-Z0-9]/g, '-')` encoder — leading `-` and non-alnum handling differ from Cursor’s observed dirs.
3. MUST produce encoding that matches UT-001 golden: `/Users/rafael/Dev/open-source-contribute/agent-flow` → `Users-rafael-Dev-open-source-contribute-agent-flow`.
4. MUST keep the helper pure (no filesystem I/O) so tests and the watcher can inject `$CURSOR_HOME` independently.
5. MUST commit redacted main-session JSONL fixtures under `extension/test/fixtures/cursor/` covering valid messages, malformed lines, and empty content (no hierarchy/`subagents/` fixtures required for V1).
6. SHOULD document the ADR-003 whitespace example (e.g. `AI Knowledge` → hyphenated) next to the helper or in test names.
</requirements>

## Subtasks

- [x] 1.1 Add pure `encodeCursorProjectPath` helper in the extension package
- [x] 1.2 Cover absolute POSIX paths with leading `/` stripped (no leading `-` in result)
- [x] 1.3 Cover whitespace-in-path encoding (UT-060)
- [x] 1.4 Assert encoding does not invent a sibling project name that would match another workspace (UT-003)
- [x] 1.5 Capture/redact at least one real-shape main transcript JSONL with `role` + `message.content[].text`
- [x] 1.6 Add empty and malformed-line fixture files for later parser resilience tests
- [x] 1.7 Wire Node/`tsx` unit tests for UT-001 / UT-003 / UT-060

## Implementation Details

See TechSpec **Data Models**, **Build Order** step 1, and ADR-003. Mirror fixture layout from Codex (`extension/test/fixtures/`) and the Node test harness in `codex-rollout-parser.test.ts`. Do not implement discovery or parsing in this task.

### Relevant Files

- `extension/src/session-watcher.ts` — Claude path encode contrast (do not copy)
- `extension/test/fixtures/codex-rollout-sample.jsonl` — fixture layout to mirror under `fixtures/cursor/`
- `extension/test/codex-rollout-parser.test.ts` — Node/`tsx` + fixture load pattern
- `.compozy/tasks/cursor-runtime-integration/adrs/adr-003.md` — encoding and exact-match rules

### Dependent Files

- `extension/src/cursor-path.ts` (or equivalent export) — create encoder
- `extension/test/cursor-path.test.ts` — create unit tests
- `extension/test/fixtures/cursor/*.jsonl` — create redacted main fixtures

### Related ADRs

- [ADR-003: Cursor Observe Path](adrs/adr-003.md) — encoding + exact project dir match
- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — main transcripts only; no case-fold / sibling scan

## Deliverables

- Pure `encodeCursorProjectPath` helper exported for watcher use
- Redacted main JSONL fixtures under `extension/test/fixtures/cursor/`
- Unit tests for all assigned cases
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] UT-001, UT-003, UT-060 — `encodeCursorProjectPath` happy path, no sibling invent, whitespace encoding

## Success Criteria

- Every assigned test case implemented and passing
- Encoder golden matches observed Cursor project dir naming (no leading `-`)
- Fixtures are redacted and main-session-only (no `subagents/` corpus required)
