/**
 * Unit tests for CursorTranscriptParser.
 *
 * Feeds Cursor fixtures (and a few hand-crafted edge-case lines) through the
 * parser and asserts the resulting event stream. V1 is thin by design: main
 * session only, spawn + messages only — no tool/model/context/hierarchy
 * events.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  CursorTranscriptParser,
  createCursorParseState,
  type CursorParserDelegate,
} from '../src/cursor-transcript-parser'
import { ORCHESTRATOR_NAME, MESSAGE_MAX } from '../src/constants'
import type { AgentEvent } from '../src/protocol'

/** Run a set of raw JSONL lines through the parser, returning all emitted events. */
function runLines(lines: string[]) {
  const events: AgentEvent[] = []
  const delegate: CursorParserDelegate = {
    emit: (e) => events.push(e),
    elapsed: () => 0,
  }
  const parser = new CursorTranscriptParser(delegate)
  const state = createCursorParseState()
  for (const line of lines) parser.processLine(line, state, ORCHESTRATOR_NAME)
  return { events, state }
}

function runFixture(name: string) {
  const file = path.join(__dirname, 'fixtures', 'cursor', name)
  const raw = fs.readFileSync(file, 'utf-8')
  const lines = raw.split('\n').filter(l => l.length > 0)
  return runLines(lines)
}

describe('CursorTranscriptParser', () => {
  describe('spawn', () => {
    it('emits exactly one main agent_spawn on first valid activity, runtime=cursor', () => {
      const { events } = runFixture('main.jsonl')
      const spawns = events.filter(e => e.type === 'agent_spawn')
      assert.equal(spawns.length, 1)
      assert.equal(spawns[0].payload.runtime, 'cursor')
      assert.equal(spawns[0].payload.name, ORCHESTRATOR_NAME)
      assert.equal(spawns[0].payload.isMain, true)
    })
  })

  describe('messages', () => {
    it('maps user text content to a message event with role=user', () => {
      const { events } = runFixture('main.jsonl')
      const userMessages = events.filter(e => e.type === 'message' && e.payload.role === 'user')
      assert.equal(userMessages.length, 2)
      assert.equal(userMessages[0].payload.content, 'What files are in the project?')
      assert.equal(userMessages[0].payload.agent, ORCHESTRATOR_NAME)
    })

    it('maps assistant text content to a message event with role=assistant', () => {
      const { events } = runFixture('main.jsonl')
      const asstMessages = events.filter(e => e.type === 'message' && e.payload.role === 'assistant')
      assert.equal(asstMessages.length, 2)
      assert.ok(String(asstMessages[0].payload.content).includes('TypeScript files'))
    })
  })

  describe('resilience', () => {
    it('skips non-JSON / malformed lines without throwing; subsequent valid lines still emit', () => {
      assert.doesNotThrow(() => runFixture('malformed.jsonl'))
      const { events } = runFixture('malformed.jsonl')
      const messages = events.filter(e => e.type === 'message')
      // Only the two valid JSON lines in the fixture should produce messages.
      assert.equal(messages.length, 2)
      assert.equal(messages[0].payload.content, 'Valid message')
      assert.equal(messages[1].payload.content, 'Another valid message')
    })

    it('skips an unknown top-level JSON shape without throwing', () => {
      const { events } = runLines([
        '{"role":"system","event":"session_start"}',
        '{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}',
      ])
      const messages = events.filter(e => e.type === 'message')
      assert.equal(messages.length, 1)
      assert.equal(messages[0].payload.content, 'hello')
    })
  })

  describe('empty trail', () => {
    it('emits zero events for an empty file — no spawn, no subagent_dispatch', () => {
      const { events } = runFixture('empty.jsonl')
      assert.equal(events.length, 0)
      assert.ok(!events.some(e => e.type === 'subagent_dispatch'))
    })
  })

  describe('dedup', () => {
    it('does not duplicate a replayed message line via seenMessageHashes', () => {
      const line = '{"role":"user","message":{"content":[{"type":"text","text":"repeat me"}]}}'
      const { events } = runLines([line, line, line])
      const messages = events.filter(e => e.type === 'message')
      assert.equal(messages.length, 1)
    })
  })

  describe('truncation', () => {
    it('truncates oversized text to MESSAGE_MAX', () => {
      const oversized = 'x'.repeat(MESSAGE_MAX + 500)
      const line = JSON.stringify({ role: 'assistant', message: { content: [{ type: 'text', text: oversized }] } })
      const { events } = runLines([line])
      const messages = events.filter(e => e.type === 'message')
      assert.equal(messages.length, 1)
      assert.equal(String(messages[0].payload.content).length, MESSAGE_MAX)
    })
  })

  describe('redacted content', () => {
    it('passes [REDACTED] through literally rather than inventing prose', () => {
      const line = '{"role":"assistant","message":{"content":[{"type":"text","text":"[REDACTED]"}]}}'
      const { events } = runLines([line])
      const messages = events.filter(e => e.type === 'message')
      assert.equal(messages.length, 1)
      assert.equal(messages[0].payload.content, '[REDACTED]')
    })

    it('does not emit a message for a thinking-only block with no text', () => {
      const line = '{"role":"assistant","message":{"content":[{"type":"thinking"}]}}'
      const { events } = runLines([line])
      assert.equal(events.filter(e => e.type === 'message').length, 0)
    })
  })

  describe('ordering', () => {
    it('emits events in non-decreasing processing order for lines 1..N', () => {
      const { events } = runFixture('main.jsonl')
      // spawn, then user, assistant, user, assistant — in fixture line order.
      assert.equal(events.length, 5)
      assert.equal(events[0].type, 'agent_spawn')
      assert.deepEqual(events.slice(1).map(e => e.payload.role), ['user', 'assistant', 'user', 'assistant'])
      assert.deepEqual(events.slice(1).map(e => e.payload.content), [
        'What files are in the project?',
        'I can see the project contains TypeScript files, configuration files, and documentation.',
        'Help me refactor the main.ts file',
        "I'll help you refactor main.ts by extracting helper functions and improving readability.",
      ])
    })
  })

  describe('no tool/hierarchy events', () => {
    it('never emits tool_call_*, model_detected, context_update, or subagent_dispatch', () => {
      const { events } = runFixture('main.jsonl')
      const forbidden = new Set([
        'tool_call_start', 'tool_call_end', 'model_detected',
        'context_update', 'subagent_dispatch', 'subagent_return',
      ])
      assert.ok(!events.some(e => forbidden.has(e.type)))
    })
  })
})
