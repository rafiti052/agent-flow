/**
 * Encode an absolute workspace path to its Cursor project directory name, e.g.
 * ~/.cursor/projects/<encoded-workspace>/agent-transcripts/<session-uuid>/
 *
 * Drops leading path separators, then replaces path separators (/, \), the
 * Windows drive-letter colon, and whitespace with hyphens (observed from
 * Cursor behavior — 'C:\Users\rafael\agent-flow' → 'C-Users-rafael-agent-flow').
 */
export function encodeCursorProjectPath(fsPath: string): string {
  const normalized = fsPath.replace(/^[/\\]+/, '')
  return normalized.replace(/[/\\:\s]+/g, '-')
}
