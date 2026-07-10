import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tokenize, createRecall } from '../src/lib/recall.js'

function world(t) {
  const claudeDir = mkdtempSync(join(tmpdir(), 'basecamp-recall-claude-'))
  const home = mkdtempSync(join(tmpdir(), 'basecamp-recall-home-'))
  t.after(() => {
    rmSync(claudeDir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  })
  return { claudeDir, home }
}

function writeSession(claudeDir, projectId, sessionId, entries, ageMinutes = 0) {
  const dir = join(claudeDir, 'projects', projectId)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${sessionId}.jsonl`)
  writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  if (ageMinutes) {
    const when = new Date(Date.now() - ageMinutes * 60 * 1000)
    utimesSync(file, when, when)
  }
  return file
}

const userSays = (text) => ({ type: 'user', message: { role: 'user', content: text }, timestamp: '2026-07-01T00:00:00Z' })
const claudeSays = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const claudeRuns = (command) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } })

test('tokenize keeps words, identifiers, and filenames; drops noise', () => {
  assert.deepEqual(tokenize('Fix the auth race in sessionStore.js'), ['fix', 'the', 'auth', 'race', 'in', 'sessionstore.js'])
  assert.ok(tokenize('src/lib/runner.js').includes('runner.js'))
  assert.ok(!tokenize('x 1699999999999').includes('1699999999999')) // long ids are noise
  assert.deepEqual(tokenize('...'), [])
})

test('first query kicks the build and reports building; then finds sessions', async (t) => {
  const { claudeDir, home } = world(t)
  writeSession(claudeDir, '-repo-alpha', 'sess-auth', [
    userSays('we need to fix the authbug in the login flow'),
    claudeSays('The race is in refreshToken — patching now.'),
  ])
  writeSession(claudeDir, '-repo-beta', 'sess-deploy', [
    userSays('deploy the staging environment'),
    claudeRuns('kubectl apply -f staging.yaml'),
  ])

  const recall = createRecall(claudeDir, home)
  const cold = await recall.search('authbug')
  assert.equal(cold.building, true)
  assert.deepEqual(cold.results, [])

  await recall.ready()
  const warm = await recall.search('authbug')
  assert.equal(warm.building, false)
  assert.equal(warm.results.length, 1)
  assert.equal(warm.results[0].sessionId, 'sess-auth')
  assert.match(warm.results[0].snippet, /authbug/i)
  assert.equal(warm.results[0].title, 'we need to fix the authbug in the login flow')
})

test('multi-token queries AND together; the last token matches as a prefix', async (t) => {
  const { claudeDir, home } = world(t)
  writeSession(claudeDir, '-repo-alpha', 'sess-auth', [userSays('fix the authbug in login'), claudeSays('done')])
  writeSession(claudeDir, '-repo-alpha', 'sess-other', [userSays('fix the readme typos'), claudeSays('done')])

  const recall = createRecall(claudeDir, home)
  await recall.ready()

  const anded = await recall.search('fix login')
  assert.equal(anded.results.length, 1)
  assert.equal(anded.results[0].sessionId, 'sess-auth')

  const prefixed = await recall.search('authb') // typeahead on the trailing token
  assert.equal(prefixed.results.length, 1)
  assert.equal(prefixed.results[0].sessionId, 'sess-auth')

  const none = await recall.search('authbug staging')
  assert.equal(none.results.length, 0)
})

test('tool commands are searchable', async (t) => {
  const { claudeDir, home } = world(t)
  writeSession(claudeDir, '-repo-beta', 'sess-deploy', [claudeRuns('kubectl apply -f staging.yaml')])

  const recall = createRecall(claudeDir, home)
  await recall.ready()
  const found = await recall.search('kubectl')
  assert.equal(found.results.length, 1)
  assert.match(found.results[0].snippet, /kubectl apply/)
})

test('the index updates incrementally and ranks fresh sessions first', async (t) => {
  const { claudeDir, home } = world(t)
  writeSession(claudeDir, '-repo-alpha', 'sess-old', [userSays('migration plan for postgres')], 60)

  const recall = createRecall(claudeDir, home)
  await recall.ready()
  assert.equal((await recall.search('migration')).results.length, 1)

  writeSession(claudeDir, '-repo-beta', 'sess-new', [userSays('migration retro notes')])
  await recall.ready(true) // force past the sweep throttle
  const results = (await recall.search('migration')).results
  assert.equal(results.length, 2)
  assert.equal(results[0].sessionId, 'sess-new') // newest first
})

test('the persisted index survives a restart', async (t) => {
  const { claudeDir, home } = world(t)
  writeSession(claudeDir, '-repo-alpha', 'sess-auth', [userSays('the flag is xyzzy-plugh')])

  const first = createRecall(claudeDir, home)
  await first.ready()
  assert.equal((await first.search('xyzzy-plugh')).results.length, 1)
  assert.ok(existsSync(join(home, 'recall-index.json')))

  const second = createRecall(claudeDir, home) // fresh instance, same home
  await second.ready()
  assert.equal((await second.search('xyzzy-plugh')).results.length, 1)
})
