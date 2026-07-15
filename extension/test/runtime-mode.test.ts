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
    it('resolves cursor', () => {
      assert.equal(resolveConfiguredMode('cursor'), 'cursor')
    })

    it('resolves claude', () => {
      assert.equal(resolveConfiguredMode('claude'), 'claude')
    })

    it('resolves codex', () => {
      assert.equal(resolveConfiguredMode('codex'), 'codex')
    })

    it('resolves auto', () => {
      assert.equal(resolveConfiguredMode('auto'), 'auto')
    })

    // Unknown, missing, empty, and case-mismatched input all take the same
    // safe-default fallback branch — one test covers the branch across
    // input shapes rather than one near-identical test per shape.
    it('unknown/missing/empty/case-mismatched values all map to auto (safe default, no cursor)', () => {
      for (const raw of ['nope', undefined, '', 'Cursor']) {
        const mode = resolveConfiguredMode(raw)
        // Computed before assert.equal narrows the type of `mode` below.
        const wantsCursor = mode === 'cursor'
        assert.equal(mode, 'auto', `expected ${JSON.stringify(raw)} to resolve to auto`)
        assert.equal(wantsCursor, false)
      }
    })

    it('env var cursor resolves relay mode to cursor', () => {
      const mode = resolveRuntimeMode(undefined, 'cursor')
      // cursor mode does not require Claude; computed before assert.equal narrows `mode` below.
      const wantClaude = mode === 'claude' || mode === 'auto'
      assert.equal(mode, 'cursor')
      assert.equal(wantClaude, false)
    })

    it('env var claude resolves relay mode to claude', () => {
      assert.equal(resolveRuntimeMode(undefined, 'claude'), 'claude')
    })

    it('env var codex resolves relay mode to codex', () => {
      assert.equal(resolveRuntimeMode(undefined, 'codex'), 'codex')
    })

    it('unknown env var falls back to auto', () => {
      assert.equal(resolveRuntimeMode(undefined, 'invalid'), 'auto')
    })

    it('explicit param overrides env var', () => {
      assert.equal(resolveRuntimeMode('cursor', 'claude'), 'cursor')
    })

    it('no explicit param and no env var falls back to auto', () => {
      assert.equal(resolveRuntimeMode(undefined, undefined), 'auto')
    })
  })

  describe('Want-Cursor semantics (auto / claude do not want/start Cursor)', () => {
    it('auto mode does not want cursor', () => {
      const mode = resolveConfiguredMode('auto')
      assert.equal(mode === 'cursor', false)
    })

    it('claude mode does not want cursor', () => {
      const mode = resolveConfiguredMode('claude')
      assert.equal(mode === 'cursor', false)
    })

    it('codex mode does not want cursor', () => {
      const mode = resolveConfiguredMode('codex')
      assert.equal(mode === 'cursor', false)
    })

    it('cursor mode wants cursor', () => {
      const mode = resolveConfiguredMode('cursor')
      assert.equal(mode === 'cursor', true)
    })

    it('unknown value defaults to auto, which does not want cursor', () => {
      const mode = resolveConfiguredMode('unknown')
      assert.equal(mode === 'cursor', false)
    })
  })

  describe('Claude/Codex auto semantics remain unchanged (no OR-with-auto for Cursor)', () => {
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
