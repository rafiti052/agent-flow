/**
 * Cursor project path encoder.
 *
 * Maps an absolute workspace fsPath to the Cursor project directory name.
 * Per ADR-003, Cursor stores agent transcripts under:
 *   ~/.cursor/projects/<encoded-workspace>/agent-transcripts/<session-uuid>/
 *
 * Encoding rules (observed from Cursor behavior):
 * - Drop leading path separators (/)
 * - Replace forward slashes (/) and whitespace (spaces, tabs, etc.) with hyphens (-)
 *
 * Example: `/Users/rafael/Dev/open-source-contribute/agent-flow`
 *          → `Users-rafael-Dev-open-source-contribute-agent-flow`
 *
 * This is a pure function with no filesystem I/O, so tests and watchers can
 * inject different `CURSOR_HOME` values independently.
 */

/**
 * Encode an absolute workspace path to its Cursor project directory name.
 *
 * @param fsPath - Absolute workspace path (e.g., `/Users/raphael/Dev/…`)
 * @returns Encoded project directory name (no leading `-`, `/` and whitespace → `-`)
 *
 * @example
 * encodeCursorProjectPath('/Users/rafael/Dev/open-source-contribute/agent-flow')
 * // → 'Users-rafael-Dev-open-source-contribute-agent-flow'
 *
 * @example
 * encodeCursorProjectPath('/path/with spaces/AI Knowledge')
 * // → 'path-with-spaces-AI-Knowledge'
 */
export function encodeCursorProjectPath(fsPath: string): string {
  // Strip leading path separators
  let normalized = fsPath.replace(/^\/+/, '')

  // Replace all forward slashes and whitespace with hyphens
  // Whitespace includes spaces, tabs, newlines, etc.
  normalized = normalized.replace(/[/\s]+/g, '-')

  return normalized
}
