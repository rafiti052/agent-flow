import * as fs from 'node:fs'
import * as path from 'node:path'
import { encodeCursorProjectPath } from '../../src/cursor-path'

/** Build a temp $CURSOR_HOME with a `<sid>/<sid>.jsonl` under the encoded
 *  project dir for `workspace`, seeded with `content`. */
export function seedSession(home: string, workspace: string, sessionId: string, content: string): string {
  const dir = path.join(home, 'projects', encodeCursorProjectPath(workspace), 'agent-transcripts', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${sessionId}.jsonl`)
  fs.writeFileSync(filePath, content)
  return filePath
}
