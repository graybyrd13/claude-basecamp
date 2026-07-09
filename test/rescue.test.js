import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyEnd, rescuePrompt } from '../src/lib/rescue.js'

const base = {
  userMessages: 3,
  lastEvent: null,
  lastToolName: null,
  lastUserText: null,
}

test('classifyEnd flags a session that died mid-tool-call', () => {
  const ending = classifyEnd({ ...base, lastEvent: 'assistant-tool', lastToolName: 'Bash' })
  assert.equal(ending.reason, 'crashed mid-action')
  assert.match(ending.detail, /Bash/)
})

test('classifyEnd flags a session that ended on a tool result', () => {
  const ending = classifyEnd({ ...base, lastEvent: 'tool-result' })
  assert.equal(ending.reason, 'stopped mid-task')
})

test('classifyEnd flags an unanswered user message', () => {
  const ending = classifyEnd({ ...base, lastEvent: 'user', lastUserText: 'please fix the login bug' })
  assert.equal(ending.reason, 'unanswered request')
  assert.match(ending.detail, /login bug/)
})

test('classifyEnd labels user interruptions distinctly', () => {
  const ending = classifyEnd({ ...base, lastEvent: 'user', lastUserText: '[Request interrupted by user]' })
  assert.equal(ending.reason, 'interrupted')
})

test('classifyEnd ignores cleanly finished sessions', () => {
  assert.equal(classifyEnd({ ...base, lastEvent: 'assistant-text' }), null)
})

test('classifyEnd ignores sessions with no real user messages', () => {
  assert.equal(classifyEnd({ ...base, userMessages: 0, lastEvent: 'assistant-tool' }), null)
  assert.equal(classifyEnd(null), null)
})

test('rescuePrompt instructs continuation, verification, and commit', () => {
  const prompt = rescuePrompt()
  assert.match(prompt, /ended unexpectedly/)
  assert.match(prompt, /commit/)
  assert.match(prompt, /tests/)
})
