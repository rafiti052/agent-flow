/**
 * Cursor project path encoder.
 *
 * Maps an absolute workspace fsPath to the Cursor project directory name.
 * Per ADR-003, Cursor stores agent transcripts under:
 *   ~/.cursor/projects/<encoded-workspace>/agent-transcripts/<session-uuid>/
 *
 * Encoding rules (observed from Cursor behavior):
 * - Drop leading path separators (/ on POSIX, \ on Windows)
 * - Replace path separators (/, \), the Windows drive-letter colon (:), and
 *   whitespace (spaces, tabs, etc.) with hyphens (-)
 *
 * Example: `/Users/rafael/Dev/open-source-contribute/agent-flow`
 *          → `Users-rafael-Dev-open-source-contribute-agent-flow`
 *
 * Example (Windows): `C:\Users\rafael\agent-flow` → `C-Users-rafael-agent-flow`
 *
 * This is a pure function with no filesystem I/O, so tests and watchers can
 * inject different `CURSOR_HOME` values independently.
 */

/**
 * Encode an absolute workspace path to its Cursor project directory name.
 *
 * @param fsPath - Absolute workspace path (e.g., `/Users/raphael/Dev/…` or `C:\Users\raphael\…`)
 * @returns Encoded project directory name (no leading `-`; path separators,
 *   the Windows drive-letter colon, and whitespace all collapse to `-`)
 *
 * @example
 * encodeCursorProjectPath('/Users/rafael/Dev/open-source-contribute/agent-flow')
 * // → 'Users-rafael-Dev-open-source-contribute-agent-flow'
 *
 * @example
 * encodeCursorProjectPath('/path/with spaces/AI Knowledge')
 * // → 'path-with-spaces-AI-Knowledge'
 *
 * @example
 * encodeCursorProjectPath('C:\\Users\\rafael\\agent-flow')
 * // → 'C-Users-rafael-agent-flow'
 */
export function encodeCursorProjectPath(fsPath: string): string {
  // Strip leading path separators (POSIX / or Windows \)
  let normalized = fsPath.replace(/^[/\\]+/, '')

  // Replace path separators (/, \), the Windows drive-letter colon (:), and
  // whitespace with hyphens. Consecutive separators (e.g. Windows' `:\`
  // after a drive letter) collapse to a single hyphen, same as `//` does.
  normalized = normalized.replace(/[/\\:\s]+/g, '-')

  return normalized
}
