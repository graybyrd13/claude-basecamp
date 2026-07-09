import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listProjects, listSessions, summarizeSession } from '../src/lib/sessions.js'

const FIXTURE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claude-dir')
const PROJECT_ID = '-Users-test-my-app'
const SESSION_ID = 'abc12345-0000-0000-0000-000000000000'

test('listProjects finds fixture project with decoded path', () => {
  const projects = listProjects(FIXTURE_DIR)
  assert.equal(projects.length, 1)
  assert.equal(projects[0].id, PROJECT_ID)
  assert.equal(projects[0].path, '/Users/test/my/app')
  assert.equal(projects[0].sessionCount, 1)
})

test('listProjects returns empty array when projects dir is missing', () => {
  assert.deepEqual(listProjects('/nonexistent'), [])
})

test('listSessions lists transcript files with metadata', () => {
  const sessions = listSessions(FIXTURE_DIR, PROJECT_ID)
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, SESSION_ID)
  assert.ok(sessions[0].bytes > 0)
})

test('summarizeSession aggregates tokens, messages, and tool calls', async () => {
  const s = await summarizeSession(FIXTURE_DIR, PROJECT_ID, SESSION_ID)
  assert.equal(s.title, 'Fix the login bug')
  assert.equal(s.userMessages, 2) // sidechain user message excluded
  assert.equal(s.assistantMessages, 2)
  assert.equal(s.toolCalls, 2)
  assert.equal(s.subagents, 1)
  assert.deepEqual(s.tokens, { input: 180, output: 650, cacheRead: 11000, cacheCreation: 1200 })
  assert.deepEqual(s.models, { 'claude-sonnet-5': 2 })
  assert.deepEqual(s.slashCommands, ['/review'])
})

test('summarizeSession survives malformed JSONL lines', async () => {
  // The fixture contains an invalid line; parsing must still succeed.
  const s = await summarizeSession(FIXTURE_DIR, PROJECT_ID, SESSION_ID)
  assert.ok(s !== null)
})

test('summarizeSession returns null for missing session', async () => {
  const s = await summarizeSession(FIXTURE_DIR, PROJECT_ID, 'does-not-exist')
  assert.equal(s, null)
})
