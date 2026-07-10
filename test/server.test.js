import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'
import { ledgerBump } from '../src/lib/governor.js'

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

/** Like withServer, but also hands back the store so a test can seed a run directly. */
async function withServerAndStores(t) {
  const basecampHome = mkdtempSync(join(tmpdir(), 'basecamp-server-test-'))
  const { server, stores } = await startServer({ port: 0, claudeDir: FIXTURE_DIR, basecampHome })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => {
    server.close()
    rmSync(basecampHome, { recursive: true, force: true })
  })
  return { base, stores }
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

test('budget endpoint reports month-to-date spend and caps', async (t) => {
  const { base, stores } = await withServerAndStores(t)

  const before = await (await fetch(`${base}/api/budget`)).json()
  assert.equal(before.spend.totalUsd, 0)
  assert.equal(before.monthlyBudgetUsd, 0)

  stores.settings.insert({ monthlyBudgetUsd: 5 })
  const run = stores.runs.insert({ projectPath: '/repo', costUsd: 1.25, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(run.id))

  const after = await (await fetch(`${base}/api/budget`)).json()
  assert.equal(after.monthlyBudgetUsd, 5)
  assert.equal(after.spend.totalUsd, 1.25)
  assert.equal(after.spend.byRepo['/repo'], 1.25)
  assert.equal(after.spend.runs, 1)

  // Hostile or garbage numbers must clamp server-side — a negative cap would
  // otherwise compare true on every reconcile tick.
  await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      monthlyBudgetUsd: 'abc',
      maxConcurrentRuns: -3,
      maxRunsPerDay: 'NaN',
      maxFailStreak: 0,
      repoBudgetsUsd: { '/bad': 'x', '/ok': 2, '/neg': -1 },
    }),
  })
  const clamped = await (await fetch(`${base}/api/budget`)).json()
  assert.equal(clamped.monthlyBudgetUsd, 0)
  assert.equal(clamped.maxConcurrentRuns, 1)
  assert.equal(clamped.maxRunsPerDay, 6)
  assert.equal(clamped.maxFailStreak, 1)
  assert.deepEqual(clamped.repoBudgetsUsd, { '/ok': 2 })
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
      effort: 'medium',
    }),
  })
  assert.equal(created.status, 201)
  const routine = await created.json()
  assert.ok(routine.id)
  assert.ok(routine.nextRun > Date.now())
  assert.equal(routine.scheduleLabel, 'daily at 09:00')
  assert.equal(routine.permissionMode, 'acceptEdits')
  assert.equal(routine.effort, 'medium')

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

test('chat history endpoint returns empty history and default prefs for fresh project', async (t) => {
  const base = await withServer(t)
  const res = await fetch(`${base}/api/chat/history?project=%2Ftmp`)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.deepEqual(data.messages, [])
  assert.equal(data.busy, false)
  assert.equal(data.model, null)
  assert.equal(data.effort, null)
  assert.equal(data.permissionMode, 'acceptEdits')
})

test('chat history endpoint returns the last-used model, effort, and permission mode', async (t) => {
  const { base, stores } = await withServerAndStores(t)
  stores.managers.insert({ projectPath: '/tmp', sessionId: 'sess-1', model: 'opus', permissionMode: 'plan', effort: 'xhigh' })
  const data = await (await fetch(`${base}/api/chat/history?project=%2Ftmp`)).json()
  assert.equal(data.model, 'opus')
  assert.equal(data.effort, 'xhigh')
  assert.equal(data.permissionMode, 'plan')
})

test('models endpoint lists models seen in real sessions plus CLI effort levels', async (t) => {
  const base = await withServer(t)
  const data = await (await fetch(`${base}/api/models`)).json()
  const sonnet = data.models.find((m) => m.id === 'claude-sonnet-5')
  assert.ok(sonnet, 'model used in fixture transcripts is discovered')
  assert.equal(sonnet.label, 'Sonnet 5')
  assert.deepEqual(data.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
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

test('settings persist and round-trip', async (t) => {
  const base = await withServer(t)
  const defaults = await (await fetch(`${base}/api/settings`)).json()
  assert.equal(defaults.slackWebhook, '')
  assert.equal(defaults.notifyOnSuccess, false)

  const updated = await (
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slackWebhook: 'https://hooks.slack.com/x', notifyOnSuccess: true, bogusField: 'ignored' }),
    })
  ).json()
  assert.equal(updated.slackWebhook, 'https://hooks.slack.com/x')
  assert.equal(updated.notifyOnSuccess, true)
  assert.equal('bogusField' in updated, false)
})

test('notify test endpoint reports no channels when unconfigured', async (t) => {
  const base = await withServer(t)
  const { results } = await (await fetch(`${base}/api/notify/test`, { method: 'POST' })).json()
  assert.deepEqual(results, [])
})

test('routines get webhook tokens and unknown tokens 404', async (t) => {
  const base = await withServer(t)
  const created = await (
    await fetch(`${base}/api/routines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'hooked',
        projectPath: '/definitely/not/real',
        prompt: 'x',
        schedule: { type: 'daily', time: '09:00' },
      }),
    })
  ).json()
  assert.match(created.webhookToken, /^[0-9a-f]{32}$/)

  const missing = await fetch(`${base}/api/hooks/deadbeef`, { method: 'POST' })
  assert.equal(missing.status, 404)

  // Valid token but nonexistent project path: launch fails with a 400-class error.
  const bad = await fetch(`${base}/api/hooks/${created.webhookToken}`, { method: 'POST' })
  assert.equal(bad.status, 400)
})

test('connector add validates input and rejects bad names', async (t) => {
  const base = await withServer(t)
  const bad = await fetch(`${base}/api/connectors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'evil name!', transport: 'http', url: 'https://x.example' }),
  })
  assert.equal(bad.status, 400)

  const badUrl = await fetch(`${base}/api/connectors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ok-name', transport: 'http', url: 'notaurl' }),
  })
  assert.equal(badUrl.status, 400)
})

test('rescue endpoint lists candidates and validates rescue requests', async (t) => {
  const base = await withServer(t)

  // Fixture project's decoded path doesn't exist on disk, so no candidates.
  const candidates = await (await fetch(`${base}/api/rescue`)).json()
  assert.ok(Array.isArray(candidates))

  const missing = await fetch(`${base}/api/rescue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'abc' }),
  })
  assert.equal(missing.status, 400)

  const badPath = await fetch(`${base}/api/rescue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'abc', projectPath: '/definitely/not/real' }),
  })
  assert.equal(badPath.status, 400)
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

test('approve/deny endpoints 404 for unknown run ids', async (t) => {
  const base = await withServer(t)
  assert.equal((await fetch(`${base}/api/runs/nope/approve`, { method: 'POST' })).status, 404)
  assert.equal((await fetch(`${base}/api/runs/nope/deny`, { method: 'POST' })).status, 404)
})

test('deny endpoint transitions an awaiting-approval run to denied over HTTP', async (t) => {
  const { base, stores } = await withServerAndStores(t)
  // Seeded directly in the store: there's no HTTP-only way to get a run into
  // awaiting-approval without a real `claude` binary on PATH. The state
  // machine itself (denial detection, resume args, rejecting bad transitions)
  // is covered against a fake spawn in test/runner.test.js — this just checks
  // the route wiring.
  const run = stores.runs.insert({
    projectPath: '/tmp/some-project',
    prompt: 'do a thing',
    status: 'awaiting-approval',
    sessionId: 'sess-x',
    permissionDenials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf x' } }],
  })

  const res = await fetch(`${base}/api/runs/${run.id}/deny`, { method: 'POST' })
  assert.equal(res.status, 200)
  const denied = await res.json()
  assert.equal(denied.status, 'denied')

  const updates = await (await fetch(`${base}/api/updates`)).json()
  assert.equal(updates[0].kind, 'run-denied')

  // Denying twice is rejected — it's no longer awaiting approval.
  const second = await fetch(`${base}/api/runs/${run.id}/deny`, { method: 'POST' })
  assert.equal(second.status, 400)
})

test('approve endpoint rejects a run that is not awaiting approval', async (t) => {
  const { base, stores } = await withServerAndStores(t)
  const run = stores.runs.insert({ projectPath: '/tmp/some-project', prompt: 'x', status: 'succeeded' })
  const res = await fetch(`${base}/api/runs/${run.id}/approve`, { method: 'POST' })
  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /awaiting approval/)
})
