---
status: completed
title: Docs disclosure & acceptance checklist
type: docs
complexity: low
---

# Task 7: Docs disclosure & acceptance checklist

## Overview

Document that Agent Flow reads local Cursor agent data only when mode is `cursor`, and close the contributor acceptance loop for #67 under ADR-006: main-attach demo bar, privacy disclosure, non-regression, and an explicit follow-up note for hierarchy + Cursor-in-`auto`. This task also owns full-stack E2E journeys that require both backend wiring and web labels.

<critical>
- ALWAYS READ the PRD, the TechSpec, and their catalogs (`_user_stories.md`, `_tests.md`) before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — implement every test case assigned in ## Tests
</critical>

<requirements>
1. MUST update README (Supported runtimes / settings) to document `cursor` mode and `AGENT_FLOW_RUNTIME=cursor`.
2. MUST disclose local read-only observation of `$CURSOR_HOME` (default `~/.cursor`) agent transcripts when Cursor watching is enabled — optional/killable; no mandatory first-run modal (US-010 / E2E-005).
3. MUST state clearly that `auto` remains Claude+Codex only (Cursor off) in V1.
4. MUST prepare PR description referencing #67 with ADR-006 follow-ups: proven `subagents/` children + optional Cursor-in-`auto` (E2E-006).
5. MUST verify E2E-001 against the integrated stack (mode `cursor`, main session, `CURSOR` labels, best-effort messages, no children required).
6. MUST confirm contribution scope stays Codex-adapter-shaped (no pluggability registry) — E2E-006.
7. SHOULD add an optional CHANGELOG note consistent with prior runtime entries.
8. MUST NOT require a first-run privacy modal.
</requirements>

## Subtasks

- [x] 7.1 Document `agentVisualizer.runtime: cursor` and env equivalent in README
- [x] 7.2 Document `$CURSOR_HOME` / `~/.cursor` read-only observe + kill via mode change
- [x] 7.3 Clarify `auto` = Claude+Codex (Cursor not included in V1)
- [x] 7.4 Run/record E2E-001 main-attach journey with `CURSOR` labeling
- [x] 7.5 Confirm E2E-005 disclosure present and no mandatory modal in product path
- [x] 7.6 Draft PR body: Fixes/Closes #67, non-registry scope, suggested follow-ups (E2E-006)
- [x] 7.7 Optional CHANGELOG entry for Cursor runtime
- [x] 7.8 Cross-check E2E-002/004 evidence from task_05 still holds after docs/UI land

## Implementation Details

See TechSpec **Docs**, **Build Order** step 6, and README sections that already document Claude/Codex + `CODEX_HOME`. Full-stack acceptance depends on task_05 and task_06.

### Relevant Files

- `README.md` — primary disclosure and runtime docs
- `extension/package.json` — enum descriptions users see in settings UI
- `extension/CHANGELOG.md` — prior runtime changelog style
- `.github/pull_request_template.md` — PR body shape
- `.compozy/tasks/cursor-runtime-integration/_tests.md` — E2E contract
- `.compozy/tasks/cursor-runtime-integration/adrs/adr-006.md` — V1 done bar + follow-ups

### Dependent Files

- `README.md` — modify for Cursor mode + disclosure
- Optional: `extension/CHANGELOG.md` — Cursor entry
- PR description (when opening #67 PR) — follow-up + scope notes

### Related ADRs

- [ADR-006: Thin V1 Scope](adrs/adr-006.md) — main attach done bar; docs; follow-ups
- [ADR-003: Cursor Observe Path](adrs/adr-003.md) — `$CURSOR_HOME` path disclosure detail

## Deliverables

- README disclosure and `cursor` mode documentation
- E2E-001 / E2E-005 / E2E-006 evidence (checklist or recorded demo notes)
- PR-ready follow-up language for hierarchy + Cursor-in-`auto`
- Every test case assigned in `## Tests` implemented and passing **(REQUIRED)**

## Tests

Cases assigned from `_tests.md` — read each ID’s full definition there before writing tests.

- [x] E2E-001 — first Cursor watch: main session, `CURSOR` labels, messages when present
- [x] E2E-005 — docs disclosure; no mandatory first-run modal
- [x] E2E-006 — Codex-shaped change set; no pluggability registry; PR suggests follow-ups

## Success Criteria

- Every assigned test case implemented and passing
- Docs make Cursor opt-in and killable without implying Cursor-in-`auto`
- Contributor acceptance bar for thin V1 (#67 / ADR-006) is demonstrable

## Evidence Notes (task_07)

No new source code in this task — docs only (`README.md`, `extension/CHANGELOG.md`). Verified by
tracing the already-committed wiring from tasks 01–06 (36bef4d, b7a6f4e, 2a3c3f3, 9f4fa77, 5d17ca4,
9a04141) rather than re-deriving it.

- **E2E-001** (main session → `CURSOR` labels → messages, no children required): traced end-to-end
  — `CursorTranscriptParser.processLine` (`extension/src/cursor-transcript-parser.ts:135`) emits the
  one-shot orchestrator `agent_spawn` with `payload.runtime === 'cursor'` and
  `payload.name === ORCHESTRATOR_NAME` on first valid activity, then best-effort `message` events for
  user/assistant text. On the web side, `handle-agent-events.ts:23` calls
  `resolveSpawnRuntime(payload.runtime)` (`web/lib/runtime-presentation.ts`) so the agent's `runtime`
  field is set to `'cursor'` (no undefined-fallthrough to Claude); every label call site
  (`draw-bubbles.ts`, `chat-panel.tsx`, `session-transcript-panel.tsx`, `message-feed-panel.tsx`)
  routes through the shared `assistantLabel()` helper, which returns `'CURSOR'` for that runtime; and
  `draw-agents.ts`'s `drawAgentBrand` uses `brandMark()`, which returns no mark at all for `'cursor'`
  (no Claude spark, no Codex mark). This is confirmed by the fixture-driven parser tests
  (`extension/test/cursor-transcript-parser.test.ts`, run against `extension/test/fixtures/cursor/`)
  and the web `runtime-presentation.test.ts` suite (UT-030–033/035) — no live Cursor install was
  available to additionally record a real end-to-end session; the evidence is the traced wiring +
  the unit/fixture suites at each hop of the pipeline.
- **E2E-005** (disclosure present; no mandatory first-run modal): disclosure added to `README.md`
  (`### Runtime selection` → `#### Cursor (opt-in)`) and cross-referenced from `## Privacy &
  Telemetry`, stating opt-in, killable, read-only, and no first-run prompt. Confirmed no
  Cursor-specific prompt/modal code exists: `promptHookSetupIfNeeded` (`extension/src/hooks-config.ts`,
  invoked from `extension/src/extension.ts`) is Claude-hooks-only and is not called from
  `cursor-runtime.ts` or anywhere in the `mode === 'cursor'` start branch in `extension.ts`'s
  `startRuntimes`.
- **E2E-006** (Codex-adapter-shaped; no pluggability registry): `git diff --stat 84cd2fb..HEAD`
  shows exactly the ADR-006 §3 shape — three new adapter files
  (`cursor-runtime.ts`, `cursor-session-watcher.ts`, `cursor-transcript-parser.ts`, plus
  `cursor-path.ts` from task_01), hard-coded `mode === 'cursor'` branches in `extension.ts` and
  `scripts/relay.ts`, and mode/label union extensions in `runtime-mode.ts` / `session-runtime.ts` /
  `web/lib/agent-types.ts` + `runtime-presentation.ts`. `grep -rn "registry\|RuntimeRegistry\|pluggab"`
  across `extension/src` and `scripts/relay.ts` returns nothing — no registry or plugin-loader
  mechanism was introduced. See the **PR Description** below for the required follow-up language.
- **E2E-002 / E2E-004 (subtask 7.8, cross-check)**: both are already covered as integration tests in
  task_05 (`extension/test/cursor-relay-wiring.test.ts` for IT-010/012/014 — status only shows Cursor
  watching under explicit `cursor` mode, never under `auto`/`claude`; `extension/test/
  cursor-runtime-wiring.test.ts` + `cursor-relay-wiring.test.ts`'s `FORCE_CURSOR_THROW` scenario for
  IT-011/017/020/021 — dispose, fail-closed, and Claude/Codex non-regression). Nothing landed in this
  task changes runtime behavior (docs only), so that evidence still holds unchanged.

Full suite still green after doc edits: 91/91 in `extension/` (`pnpm test`), 48/48 at repo root
(`pnpm run test`), `tsc --noEmit` clean in both `extension/` configs and `web/`.

## PR Description

```
Title: Add opt-in Cursor runtime support (main-session attach, V1)

Closes #67

## What

Agent Flow can now watch a Cursor session. Set `agentVisualizer.runtime` (VS Code) or
`AGENT_FLOW_RUNTIME` (pnpm run dev / npx agent-flow-app) to `"cursor"` to tail your workspace's
main Cursor agent transcript from `$CURSOR_HOME` (default `~/.cursor`) and see it on the graph,
labeled `CURSOR`.

This is intentionally a **thin V1** per the project's internal ADR-006 design decision (main-attach
only, no hierarchy/tools yet):

- Main orchestrator session only — one `agent_spawn` (runtime: `cursor`) plus best-effort
  user/assistant `message` events. No tool-call parsing, no `subagents/` hierarchy, no reasoning/
  context events in this pass.
- Explicit `cursor` mode only — **not** included in `auto` (which stays Claude + Codex,
  unchanged). You have to opt in.
- Text label only — panels/canvas show `CURSOR`; no custom glyph/logo asset, and the canvas never
  falls through to the Claude or Codex marks for a Cursor agent.
- Fail-closed — an unreadable/missing Cursor root is idle-healthy, not an error, and a Cursor
  failure never takes down Claude or Codex watching in the same process.

## Why this shape

Same contribution shape as the existing Codex adapter (#52 precedent): three files
(`cursor-runtime.ts`, `cursor-session-watcher.ts`, `cursor-transcript-parser.ts`) plus hard-coded
mode branches in `extension.ts` / `scripts/relay.ts` and mode/label union extensions. **No
pluggability registry or plugin-loader was introduced** — runtimes stay a small closed set, matching
existing project guidance (#53).

## How to test

1. Set `agentVisualizer.runtime` to `"cursor"` (or `AGENT_FLOW_RUNTIME=cursor`)
2. Start/have an active Cursor agent session in the workspace
3. Open Agent Flow — the main Cursor session should appear, labeled `CURSOR`, with messages as
   they arrive
4. Switch mode back to `"auto"` or `"claude"` — Cursor watching stops immediately, no leftover
   state

## Suggested follow-ups (not in this PR)

- Prove out `subagents/` children under Cursor and bind them into the hierarchy view (parity with
  Claude/Codex subagent trees)
- Consider including Cursor in `auto` once the adapter has more real-world mileage

## Checklist

- [x] I have read the CONTRIBUTING guide
- [x] I have signed the CLA
```
