/**
 * Encode an absolute workspace path to its Cursor project directory name.
 *
 * Cursor stores agent transcripts under:
 *   ~/.cursor/projects/<encoded-workspace>/agent-transcripts/<session-uuid>/
 *
 * Encoding rules (observed from Cursor behavior):
 * - Drop leading path separators (/ on POSIX, \ on Windows)
 * - Replace path separators (/, \), the Windows drive-letter colon (:), and
 *   whitespace (spaces, tabs, etc.) with hyphens (-)
 *
 * @param fsPath - Absolute workspace path (e.g., `/Users/raphael/Dev/…` or `C:\Users\raphael\…`)
 * @returns Encoded project directory name (no leading `-`; path separators,
 *   the Windows drive-letter colon, and whitespace all collapse to `-`)
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
