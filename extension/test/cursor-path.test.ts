/**
 * Unit tests for cursor path encoding.
 *
 * Tests the encodeCursorProjectPath function that maps absolute workspace
 * paths to Cursor's project directory names. Encoding rules:
 * - Drop leading separators (/)
 * - Replace / and whitespace with - (no leading - in result)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encodeCursorProjectPath } from '../src/cursor-path'

describe('encodeCursorProjectPath', () => {
  it('encodes absolute path by dropping leading separators and replacing / and whitespace with -', () => {
    const result = encodeCursorProjectPath('/Users/rafael/Dev/open-source-contribute/agent-flow')
    assert.equal(result, 'Users-rafael-Dev-open-source-contribute-agent-flow')
  })

  it('encodes whitespace (spaces, tabs, etc.) as hyphens', () => {
    const withSpaces = encodeCursorProjectPath('/path/with spaces/AI Knowledge')
    assert.equal(withSpaces, 'path-with-spaces-AI-Knowledge')

    const withTabs = encodeCursorProjectPath('/path/with\ttabs/here')
    assert.equal(withTabs, 'path-with-tabs-here')

    // Consecutive whitespace (including newlines) collapses to a single hyphen.
    const mixed = encodeCursorProjectPath('/path \t with \n mixed/whitespace')
    assert.equal(mixed, 'path-with-mixed-whitespace')
  })

  it('produces deterministic encoding that does not invent sibling project names', () => {
    // Encoding should be idempotent — calling twice on same input yields same output
    const path1 = '/Users/rafael/Dev/workspace-one'
    const path2 = '/Users/rafael/Dev/workspace-two'

    const encoded1a = encodeCursorProjectPath(path1)
    const encoded1b = encodeCursorProjectPath(path1)
    const encoded2 = encodeCursorProjectPath(path2)

    assert.equal(encoded1a, encoded1b)
    assert.notEqual(encoded1a, encoded2)
    assert.ok(!encoded1a.startsWith('-'), 'encoded path should not start with -')
    assert.ok(!encoded2.startsWith('-'), 'encoded path should not start with -')
    assert.equal(encoded1a, 'Users-rafael-Dev-workspace-one')
    assert.equal(encoded2, 'Users-rafael-Dev-workspace-two')
  })

  it('handles multiple leading slashes correctly', () => {
    const result = encodeCursorProjectPath('///Users/rafael/Dev/project')
    assert.equal(result, 'Users-rafael-Dev-project')
  })

  it('handles paths without leading slash', () => {
    const result = encodeCursorProjectPath('Users/rafael/Dev/project')
    assert.equal(result, 'Users-rafael-Dev-project')
  })

  it('replaces consecutive slashes with single hyphen', () => {
    const result = encodeCursorProjectPath('/Users//rafael///Dev/project')
    assert.equal(result, 'Users-rafael-Dev-project')
  })

  it('handles a real-world path with whitespace like "AI Knowledge"', () => {
    const result = encodeCursorProjectPath('/Users/rafael/Dev/AI Knowledge')
    assert.equal(result, 'Users-rafael-Dev-AI-Knowledge')
  })

  it('handles trailing whitespace', () => {
    const result = encodeCursorProjectPath('/Users/rafael/Dev/project  ')
    // Trailing whitespace collapses to single hyphen
    assert.equal(result, 'Users-rafael-Dev-project-')
  })

  it('encodes a Windows path with backslash separators and a drive letter', () => {
    const result = encodeCursorProjectPath('C:\\Users\\rafael\\agent-flow')
    assert.equal(result, 'C-Users-rafael-agent-flow')
  })

  it('handles Windows paths with whitespace the same as POSIX ones', () => {
    const result = encodeCursorProjectPath('C:\\Users\\rafael\\AI Knowledge')
    assert.equal(result, 'C-Users-rafael-AI-Knowledge')
  })

  it('handles multiple leading backslashes on Windows (UNC-style)', () => {
    const result = encodeCursorProjectPath('\\\\Users\\rafael\\project')
    assert.equal(result, 'Users-rafael-project')
  })
})
