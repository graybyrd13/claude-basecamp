import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'

const FIXTURE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claude-dir')

async function withServer(t) {
  const basecampHome = mkdtempSync(join(tmpdir(), 'basecamp-server-test-'))
  const { server } = await startServer({ port: 0, claudeDir: FIXTURE_DIR, basecampHome })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => {
    server.close()
    rmSync(basecampHome, { recursive: true, force: true })
  })
  return base
}

test('serves dashboard and read-only API endpoints', async (t) => {
  const base = await withServer(t)

  const index = await fetch(`${base}/`)
  assert.equal(index.status, 200)
  assert.match(await index.text(), /Basecamp/)

  const overview = await (await fetch(`${base}/api/overview`)).json()
  assert.equal(overview.projectCount, 1)
  assert.equal(overview.sessionCount, 1)
  assert.equal(overview.agentCount, 1)

  const usage = await (await fetch(`${base}/api/usage?days=36500`)).json()
  assert.equal(usage.totals.output, 650)

  const missing = await fetch(`${base}/api/session?project=x&id=y`)
  assert.equal(missing.status, 404)

  const traversal = await fetch(`${base}/..%2f..%2fpackage.json`)
  assert.notEqual(traversal.status, 200)
})

test('routine CRUD lifecycle over the API', async (t) => {
  const base = await withServer(t)

  const invalid = await fetch(`${base}/api/routines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' }),
  })
  assert.equal(invalid.status, 400)

  const created = await fetch(`${base}/api/routines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'nightly',
      projectPath: '/tmp',
      prompt: 'continue development',
      schedule: { type: 'daily', time: '09:00' },
    }),
  })
  assert.equal(created.status, 201)
  const routine = await created.json()
  assert.ok(routine.id)
  assert.ok(routine.nextRun > Date.now())
  assert.equal(routine.scheduleLabel, 'daily at 09:00')
  assert.equal(routine.permissionMode, 'acceptEdits')

  const paused = await fetch(`${base}/api/routines/${routine.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  })
  assert.equal((await paused.json()).nextRun, null)

  const list = await (await fetch(`${base}/api/routines`)).json()
  assert.equal(list.length, 1)

  const deleted = await fetch(`${base}/api/routines/${routine.id}`, { method: 'DELETE' })
  assert.equal(deleted.status, 200)
  assert.equal((await (await fetch(`${base}/api/routines`)).json()).length, 0)
})

test('rejects cross-origin mutating requests', async (t) => {
  const base = await withServer(t)
  const res = await fetch(`${base}/api/routines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'x' }),
  })
  assert.equal(res.status, 403)
})

test('goal CRUD lifecycle over the API', async (t) => {
  const base = await withServer(t)

  const invalid = await fetch(`${base}/api/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: '/tmp' }),
  })
  assert.equal(invalid.status, 400)

  const created = await fetch(`${base}/api/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: '/tmp/proj', title: 'Ship v1' }),
  })
  assert.equal(created.status, 201)
  const goal = await created.json()
  assert.equal(goal.status, 'open')

  const filtered = await (await fetch(`${base}/api/goals?project=${encodeURIComponent('/tmp/proj')}`)).json()
  assert.equal(filtered.length, 1)
  const other = await (await fetch(`${base}/api/goals?project=${encodeURIComponent('/elsewhere')}`)).json()
  assert.equal(other.length, 0)

  const badStatus = await fetch(`${base}/api/goals/${goal.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'bogus' }),
  })
  assert.equal(badStatus.status, 400)

  const done = await fetch(`${base}/api/goals/${goal.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  })
  assert.equal((await done.json()).status, 'done')

  assert.equal((await fetch(`${base}/api/goals/${goal.id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await (await fetch(`${base}/api/goals`)).json()).length, 0)
})

test('chat history endpoint returns empty history for fresh project', async (t) => {
  const base = await withServer(t)
  const res = await fetch(`${base}/api/chat/history?project=%2Ftmp`)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.deepEqual(data.messages, [])
  assert.equal(data.busy, false)
})

test('digest tracks updates since last ack', async (t) => {
  const base = await withServer(t)

  const initial = await (await fetch(`${base}/api/digest`)).json()
  assert.equal(initial.since, 0)

  const ack = await fetch(`${base}/api/digest/ack`, { method: 'POST' })
  assert.equal(ack.status, 200)

  const after = await (await fetch(`${base}/api/digest`)).json()
  assert.ok(after.since > 0)
  assert.deepEqual(after.items, [])
})

test('heatmap returns per-day session counts', async (t) => {
  const base = await withServer(t)
  const res = await (await fetch(`${base}/api/heatmap?days=36500`)).json()
  // The fixture session's mtime lands on some day; total count must be >= 1.
  const total = Object.values(res.counts).reduce((a, b) => a + b, 0)
  assert.ok(total >= 1)
})

test('run launch validates project path before spawning', async (t) => {
  const base = await withServer(t)
  const res = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath: '/definitely/not/a/real/path', prompt: 'hi' }),
  })
  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /does not exist/)
})
