import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSpawnRuntime, assistantLabel, brandMark } from './runtime-presentation'

describe('runtime-presentation', () => {
  describe('resolveSpawnRuntime', () => {
    // given payload.runtime === 'cursor', agent runtime field becomes 'cursor' (not undefined/claude)
    it('resolves cursor', () => {
      assert.equal(resolveSpawnRuntime('cursor'), 'cursor')
    })

    it('resolves codex', () => {
      assert.equal(resolveSpawnRuntime('codex'), 'codex')
    })

    it('resolves claude', () => {
      assert.equal(resolveSpawnRuntime('claude'), 'claude')
    })

    it('unknown string maps to undefined (Claude presentation default)', () => {
      assert.equal(resolveSpawnRuntime('nope'), undefined)
    })

    it('undefined maps to undefined', () => {
      assert.equal(resolveSpawnRuntime(undefined), undefined)
    })

    it('non-string values map to undefined', () => {
      assert.equal(resolveSpawnRuntime(42), undefined)
      assert.equal(resolveSpawnRuntime(null), undefined)
    })

    // Cursor spawn path under test always sets runtime: 'cursor'; fixture main spawn never omits it
    it('cursor payload never resolves to undefined or a different runtime', () => {
      const resolved = resolveSpawnRuntime('cursor')
      assert.equal(resolved, 'cursor')
      assert.notEqual(resolved, undefined)
      assert.notEqual(resolved, 'claude')
    })
  })

  describe('assistantLabel', () => {
    // transcript/bubble label path resolves to CURSOR (not CLAUDE/CODEX) when runtime is cursor
    it('cursor resolves to CURSOR label', () => {
      assert.equal(assistantLabel('cursor'), 'CURSOR')
    })

    it('codex resolves to CODEX label', () => {
      assert.equal(assistantLabel('codex'), 'CODEX')
    })

    it('claude resolves to CLAUDE label', () => {
      assert.equal(assistantLabel('claude'), 'CLAUDE')
    })

    it('undefined defaults to CLAUDE label', () => {
      assert.equal(assistantLabel(undefined), 'CLAUDE')
    })

    // mapping two spawns (codex + cursor) yields two different runtime labels
    it('codex and cursor spawns yield different labels', () => {
      const codexLabel = assistantLabel(resolveSpawnRuntime('codex'))
      const cursorLabel = assistantLabel(resolveSpawnRuntime('cursor'))
      assert.notEqual(codexLabel, cursorLabel)
      assert.equal(codexLabel, 'CODEX')
      assert.equal(cursorLabel, 'CURSOR')
    })
  })

  describe('brandMark', () => {
    // brand selector for 'cursor' does not choose Claude spark or Codex/OpenAI mark
    it('cursor selects no logo (non-fallthrough)', () => {
      const mark = brandMark('cursor')
      assert.equal(mark, 'none')
      assert.notEqual(mark, 'claude-spark')
      assert.notEqual(mark, 'openai-logo')
    })

    it('codex selects the OpenAI mark', () => {
      assert.equal(brandMark('codex'), 'openai-logo')
    })

    it('claude selects the Claude spark', () => {
      assert.equal(brandMark('claude'), 'claude-spark')
    })

    it('undefined defaults to the Claude spark', () => {
      assert.equal(brandMark(undefined), 'claude-spark')
    })
  })
})
