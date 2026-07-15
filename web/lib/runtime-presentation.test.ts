import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSpawnRuntime, assistantLabel, brandMark } from './runtime-presentation'

describe('runtime-presentation', () => {
  describe('resolveSpawnRuntime', () => {
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

    it('cursor payload never resolves to undefined or a different runtime', () => {
      const resolved = resolveSpawnRuntime('cursor')
      assert.equal(resolved, 'cursor')
      assert.notEqual(resolved, undefined)
      assert.notEqual(resolved, 'claude')
    })
  })

  describe('assistantLabel', () => {
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

    it('codex and cursor spawns yield different labels', () => {
      const codexLabel = assistantLabel(resolveSpawnRuntime('codex'))
      const cursorLabel = assistantLabel(resolveSpawnRuntime('cursor'))
      assert.notEqual(codexLabel, cursorLabel)
      assert.equal(codexLabel, 'CODEX')
      assert.equal(cursorLabel, 'CURSOR')
    })
  })

  describe('brandMark', () => {
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
