/**
 * Unit tests for cursor path encoding.
 *
 * Tests the encodeCursorProjectPath function that maps absolute workspace
 * paths to Cursor's project directory names. Per ADR-003, encoding rules:
 * - Drop leading separators (/)
 * - Replace / and whitespace with - (no leading - in result)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encodeCursorProjectPath } from '../src/cursor-path'

describe('encodeCursorProjectPath', () => {
  // UT-001: Golden path encoding test
  it('encodes absolute path by dropping leading separators and replacing / and whitespace with -', () => {
    const result = encodeCursorProjectPath('/Users/rafael/Dev/open-source-contribute/agent-flow')
    assert.equal(result, 'Users-rafael-Dev-open-source-contribute-agent-flow')
  })

  // UT-060: Whitespace in path encoding
  it('encodes whitespace (spaces, tabs, etc.) as hyphens', () => {
    // Test with spaces
    const withSpaces = encodeCursorProjectPath('/path/with spaces/AI Knowledge')
    assert.equal(withSpaces, 'path-with-spaces-AI-Knowledge')

    // Test with tabs (represented as escaped tab characters)
    const withTabs = encodeCursorProjectPath('/path/with\ttabs/here')
    assert.equal(withTabs, 'path-with-tabs-here')

    // Test with mixed whitespace (consecutive whitespace collapses to single hyphen)
    const mixed = encodeCursorProjectPath('/path \t with \n mixed/whitespace')
    // All consecutive whitespace including newlines collapse to single -
    assert.equal(mixed, 'path-with-mixed-whitespace')
  })

  // UT-003: Encoding determinism and no sibling invent
  it('produces deterministic encoding that does not invent sibling project names', () => {
    // Encoding should be idempotent — calling twice on same input yields same output
    const path1 = '/Users/rafael/Dev/workspace-one'
    const path2 = '/Users/rafael/Dev/workspace-two'

    const encoded1a = encodeCursorProjectPath(path1)
    const encoded1b = encodeCursorProjectPath(path1)
    const encoded2 = encodeCursorProjectPath(path2)

    // Same input always produces same output
    assert.equal(encoded1a, encoded1b)

    // Different inputs produce different outputs (no collision)
    assert.notEqual(encoded1a, encoded2)

    // Encoded values should not contain leading hyphens
    assert.ok(!encoded1a.startsWith('-'), 'encoded path should not start with -')
    assert.ok(!encoded2.startsWith('-'), 'encoded path should not start with -')

    // Verify specific values
    assert.equal(encoded1a, 'Users-rafael-Dev-workspace-one')
    assert.equal(encoded2, 'Users-rafael-Dev-workspace-two')
  })

  // Additional test: multiple leading slashes
  it('handles multiple leading slashes correctly', () => {
    const result = encodeCursorProjectPath('///Users/rafael/Dev/project')
    assert.equal(result, 'Users-rafael-Dev-project')
  })

  // Additional test: no leading slash (edge case)
  it('handles paths without leading slash', () => {
    const result = encodeCursorProjectPath('Users/rafael/Dev/project')
    assert.equal(result, 'Users-rafael-Dev-project')
  })

  // Additional test: consecutive slashes in the middle
  it('replaces consecutive slashes with single hyphen', () => {
    const result = encodeCursorProjectPath('/Users//rafael///Dev/project')
    assert.equal(result, 'Users-rafael-Dev-project')
  })

  // Additional test: real-world path with whitespace (ADR-003 example)
  it('handles ADR-003 example: path with whitespace like AI Knowledge', () => {
    // Per ADR-003: e.g. `/Users/…/AI Knowledge` → `Users-…-AI-Knowledge`
    const result = encodeCursorProjectPath('/Users/rafael/Dev/AI Knowledge')
    assert.equal(result, 'Users-rafael-Dev-AI-Knowledge')
  })

  // Additional test: trailing whitespace
  it('handles trailing whitespace', () => {
    const result = encodeCursorProjectPath('/Users/rafael/Dev/project  ')
    // Trailing whitespace collapses to single hyphen
    assert.equal(result, 'Users-rafael-Dev-project-')
  })
})
