/**
 * Unit tests for runtime mode resolution.
 *
 * Tests cover: cursor mode recognition, safe default for unknown values,
 * and want-cursor semantics (cursor mode only, not auto).
 *
 * `resolveConfiguredMode` is a pure function (no vscode / watcher
 * dependency) shared by `extension.ts` (config-driven) and
 * `scripts/relay.ts` (env-driven), so these tests exercise both surfaces'
 * resolution logic without needing a VS Code host.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfiguredMode } from '../src/runtime-mode'

/** Mirrors relay's AGENT_FLOW_RUNTIME resolution: explicit param wins, else env var. */
function resolveRuntimeMode(explicit?: string, env?: string): string {
  if (explicit !== undefined) return resolveConfiguredMode(explicit)
  return resolveConfiguredMode(env)
}

describe('Runtime Mode Resolution', () => {
  describe('resolveConfiguredMode (shared pure resolver)', () => {
    // UT-020: mode resolver: cursor only (readConfiguredMode + env)
    it('UT-020: resolves cursor', () => {
      assert.equal(resolveConfiguredMode('cursor'), 'cursor')
    })

    it('UT-020: resolves claude', () => {
      assert.equal(resolveConfiguredMode('claude'), 'claude')
    })

    it('UT-020: resolves codex', () => {
      assert.equal(resolveConfiguredMode('codex'), 'codex')
    })

    it('UT-020: resolves auto', () => {
      assert.equal(resolveConfiguredMode('auto'), 'auto')
    })

    // UT-021: unknown runtime string → safe default (auto without Cursor)
    it('UT-021: unknown string maps to auto (safe default)', () => {
      const mode = resolveConfiguredMode('nope')
      // auto never wants cursor — computed before the narrowing assertion below
      const wantsCursor = mode === 'cursor'
      assert.equal(mode, 'auto')
      assert.equal(wantsCursor, false)
    })

    it('UT-021: undefined maps to auto', () => {
      assert.equal(resolveConfiguredMode(undefined), 'auto')
    })

    it('UT-021: empty string maps to auto', () => {
      assert.equal(resolveConfiguredMode(''), 'auto')
    })

    it('UT-021: case-mismatched value maps to auto (no implicit case-folding)', () => {
      assert.equal(resolveConfiguredMode('Cursor'), 'auto')
    })

    // UT-022: AGENT_FLOW_RUNTIME=cursor env var handling
    it('UT-022: env var cursor resolves relay mode to cursor', () => {
      const mode = resolveRuntimeMode(undefined, 'cursor')
      // cursor mode does not require Claude — computed before the narrowing assertion below
      const wantClaude = mode === 'claude' || mode === 'auto'
      assert.equal(mode, 'cursor')
      assert.equal(wantClaude, false)
    })

    it('UT-022: env var claude resolves relay mode to claude', () => {
      assert.equal(resolveRuntimeMode(undefined, 'claude'), 'claude')
    })

    it('UT-022: env var codex resolves relay mode to codex', () => {
      assert.equal(resolveRuntimeMode(undefined, 'codex'), 'codex')
    })

    it('UT-022: unknown env var falls back to auto', () => {
      assert.equal(resolveRuntimeMode(undefined, 'invalid'), 'auto')
    })

    it('UT-022: explicit param overrides env var', () => {
      assert.equal(resolveRuntimeMode('cursor', 'claude'), 'cursor')
    })

    it('UT-022: no explicit param and no env var falls back to auto', () => {
      assert.equal(resolveRuntimeMode(undefined, undefined), 'auto')
    })
  })

  describe('Want-Cursor semantics (UT-028: auto / claude do not want/start Cursor)', () => {
    it('UT-028: auto mode does not want cursor', () => {
      const mode = resolveConfiguredMode('auto')
      assert.equal(mode === 'cursor', false)
    })

    it('UT-028: claude mode does not want cursor', () => {
      const mode = resolveConfiguredMode('claude')
      assert.equal(mode === 'cursor', false)
    })

    it('UT-028: codex mode does not want cursor', () => {
      const mode = resolveConfiguredMode('codex')
      assert.equal(mode === 'cursor', false)
    })

    it('UT-028: cursor mode wants cursor', () => {
      const mode = resolveConfiguredMode('cursor')
      assert.equal(mode === 'cursor', true)
    })

    it('UT-028: unknown value defaults to auto, which does not want cursor', () => {
      const mode = resolveConfiguredMode('unknown')
      assert.equal(mode === 'cursor', false)
    })
  })

  describe('Claude/Codex auto semantics remain unchanged (ADR-006: no OR-with-auto for Cursor)', () => {
    it('auto wants claude and codex but never cursor', () => {
      const mode = resolveConfiguredMode('auto')
      const wantClaude = mode === 'claude' || mode === 'auto'
      const wantCodex = mode === 'codex' || mode === 'auto'
      const wantCursor = mode === 'cursor' // must NOT be `mode === 'cursor' || mode === 'auto'`
      assert.equal(wantClaude, true)
      assert.equal(wantCodex, true)
      assert.equal(wantCursor, false)
    })

    it('cursor mode does not flip on claude/codex want flags', () => {
      const mode = resolveConfiguredMode('cursor')
      const wantClaude = mode === 'claude' || mode === 'auto'
      const wantCodex = mode === 'codex' || mode === 'auto'
      const wantCursor = mode === 'cursor'
      assert.equal(wantClaude, false)
      assert.equal(wantCodex, false)
      assert.equal(wantCursor, true)
    })
  })
})
