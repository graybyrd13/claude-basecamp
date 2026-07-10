import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { Store } from '../src/lib/store.js'
import { recordNotification, unreadCount, markRead, markAllRead } from '../src/lib/notifications.js'
import { startServer } from '../src/server.js'
import { launchRun } from '../src/lib/runner.js'
import { reconcileIntent } from '../src/lib/reconcile.js'
import { sendChatMessage, GLOBAL_CHAT } from '../src/lib/chat.js'

const FIXTURE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claude-dir')

function cleanup(...dirs) {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* locked on Windows — the OS temp cleaner owns it now */
    }
  }
}

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-notif-test-'))
  mkdirSync(join(home, 'logs'), { recursive: true })
  return {
    home,
    routines: new Store(home, 'routines'),
    runs: new Store(home, 'runs'),
    updates: new Store(home, 'updates'),
    settings: new Store(home, 'settings'),
    ledger: new Store(home, 'ledger'),
    intents: new Store(home, 'intents'),
    managers: new Store(home, 'managers'),
    messages: new Store(home, 'messages'),
    notifications: new Store(home, 'notifications'),
  }
}

/* ---------- store logic ---------- */

test('recordNotification inserts unread with the given fields', () => {
  const stores = tempStores()
  const n = recordNotification(stores, {
    type: 'run-succeeded',
    projectPath: '/repo',
    title: 'Task finished',
    body: 'all good',
    runId: 'run-1',
  })
  assert.equal(n.read, false)
  assert.equal(n.type, 'run-succeeded')
  assert.equal(n.projectPath, '/repo')
  assert.equal(n.runId, 'run-1')
  assert.equal(n.intentId, null)
  assert.ok(n.createdAt)
  cleanup(stores.home)
})

test('unreadCount counts only unread notifications', () => {
  const stores = tempStores()
  const a = recordNotification(stores, { type: 'manager-message', title: 'a' })
  recordNotification(stores, { type: 'manager-message', title: 'b' })
  assert.equal(unreadCount(stores), 2)
  markRead(stores, a.id)
  assert.equal(unreadCount(stores), 1)
  cleanup(stores.home)
})

test('markRead flips a notification and returns null for an unknown id', () => {
  const stores = tempStores()
  const n = recordNotification(stores, { type: 'escalation', title: 'decide' })
  const updated = markRead(stores, n.id)
  assert.equal(updated.read, true)
  assert.equal(markRead(stores, 'does-not-exist'), null)
  cleanup(stores.home)
})

test('markAllRead flips every unread notification once and is idempotent', () => {
  const stores = tempStores()
  recordNotification(stores, { type: 'check-drift', title: 'a' })
  recordNotification(stores, { type: 'check-drift', title: 'b' })
  recordNotification(stores, { type: 'check-drift', title: 'c' })
  assert.equal(markAllRead(stores), 3)
  assert.equal(unreadCount(stores), 0)
  assert.equal(markAllRead(stores), 0)
  cleanup(stores.home)
})

test('notifications are newest-first and capped at the same retention as other stores', () => {
  const stores = tempStores()
  for (let i = 0; i < 305; i++) {
    recordNotification(stores, { type: 'manager-message', title: `msg-${i}` })
  }
  const list = stores.notifications.list()
  assert.equal(list.length, 300)
  assert.equal(list[0].title, 'msg-304') // newest first
  assert.equal(list[list.length - 1].title, 'msg-5') // oldest 5 evicted
  cleanup(stores.home)
})

/* ---------- REST API ---------- */

async function withServer(t) {
  const basecampHome = mkdtempSync(join(tmpdir(), 'basecamp-notif-server-'))
  const { server, stores } = await startServer({ port: 0, claudeDir: FIXTURE_DIR, basecampHome })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => {
    server.close()
    cleanup(basecampHome)
  })
  return { base, stores }
}

test('GET /api/notifications returns newest-first list and unread count', async (t) => {
  const { base, stores } = await withServer(t)
  recordNotification(stores, { type: 'run-succeeded', title: 'first' })
  recordNotification(stores, { type: 'run-failed', title: 'second' })

  const res = await fetch(`${base}/api/notifications`)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.notifications.length, 2)
  assert.equal(data.notifications[0].title, 'second')
  assert.equal(data.unreadCount, 2)
})

test('POST /api/notifications/:id/read marks one read; unknown id 404s', async (t) => {
  const { base, stores } = await withServer(t)
  const n = recordNotification(stores, { type: 'escalation', title: 'decide' })

  const missing = await fetch(`${base}/api/notifications/nope/read`, { method: 'POST' })
  assert.equal(missing.status, 404)

  const res = await fetch(`${base}/api/notifications/${n.id}/read`, { method: 'POST' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).read, true)

  const after = await (await fetch(`${base}/api/notifications`)).json()
  assert.equal(after.unreadCount, 0)
})

test('POST /api/notifications/read-all clears every unread notification', async (t) => {
  const { base, stores } = await withServer(t)
  recordNotification(stores, { type: 'check-drift', title: 'a' })
  recordNotification(stores, { type: 'check-held', title: 'b' })

  const res = await fetch(`${base}/api/notifications/read-all`, { method: 'POST' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).count, 2)

  const after = await (await fetch(`${base}/api/notifications`)).json()
  assert.equal(after.unreadCount, 0)
})

test('mutating notification routes reject cross-origin requests', async (t) => {
  const { base } = await withServer(t)
  const res = await fetch(`${base}/api/notifications/read-all`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  })
  assert.equal(res.status, 403)
})

/* ---------- lifecycle wiring ---------- */

function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => child.emit('exit', null, 'SIGTERM')
  return child
}

async function finishTurn(child, lines, code = 0) {
  for (const line of lines) child.stdout.write(JSON.stringify(line) + '\n')
  child.stdout.end()
  await once(child.stdout, 'end')
  child.emit('exit', code, null)
}

async function settled(stores, runId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const run = stores.runs.get(runId)
    if (run && run.status !== 'running') return run
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return stores.runs.get(runId)
}

test('a succeeded run records a run-succeeded notification', async () => {
  const stores = tempStores()
  const projectPath = mkdtempSync(join(tmpdir(), 'basecamp-notif-project-'))
  const children = []
  const fakeSpawn = (cmd, args, opts) => {
    const child = fakeChild()
    children.push(child)
    return child
  }
  const run = launchRun(stores, { projectPath, prompt: 'do the thing' }, fakeSpawn)
  await finishTurn(children[0], [{ type: 'result', result: 'done', total_cost_usd: 0.01 }], 0)
  await settled(stores, run.id)

  const notifs = stores.notifications.list()
  const match = notifs.find((n) => n.type === 'run-succeeded' && n.runId === run.id)
  assert.ok(match, 'expected a run-succeeded notification')
  assert.equal(match.projectPath, projectPath)
  assert.equal(match.read, false)
  cleanup(stores.home, projectPath)
})

test('a failed run records a run-failed notification', async () => {
  const stores = tempStores()
  const projectPath = mkdtempSync(join(tmpdir(), 'basecamp-notif-project-'))
  const children = []
  const fakeSpawn = () => {
    const child = fakeChild()
    children.push(child)
    return child
  }
  const run = launchRun(stores, { projectPath, prompt: 'do the thing' }, fakeSpawn)
  await finishTurn(children[0], [], 1)
  await settled(stores, run.id)

  const match = stores.notifications.list().find((n) => n.type === 'run-failed' && n.runId === run.id)
  assert.ok(match, 'expected a run-failed notification')
  cleanup(stores.home, projectPath)
})

function makeIntent(stores, overrides = {}) {
  return stores.intents.insert({
    projectPath: overrides.projectPath || mkdtempSync(join(tmpdir(), 'basecamp-notif-repo-')),
    builtin: 'tests-green',
    text: null,
    label: 'Tests always green',
    intervalMinutes: 60,
    enabled: true,
    lastCheck: null,
    lastStatus: null,
    lastDetail: null,
    lastRunId: null,
    failStreak: 0,
    ...overrides,
  })
}

test('a check drifting for the first time records a check-drift notification once', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores)
  const fakeLaunch = (s, options) => s.runs.insert({ ...options, status: 'running', startedAt: Date.now() })

  const first = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: 'tests failing' }),
    launch: fakeLaunch,
  })
  assert.equal(first.lastStatus, 'converging')
  const driftNotifs = stores.notifications.list().filter((n) => n.type === 'check-drift')
  assert.equal(driftNotifs.length, 1)
  assert.equal(driftNotifs[0].intentId, intent.id)
  cleanup(stores.home)
})

test('a check recovering from drift to holding records a check-held notification', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores, { lastStatus: 'drifting', failStreak: 1 })

  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'holding', detail: 'green again' }),
  })
  assert.equal(result.lastStatus, 'holding')
  const heldNotifs = stores.notifications.list().filter((n) => n.type === 'check-held')
  assert.equal(heldNotifs.length, 1)
  cleanup(stores.home)
})

test('escalation (repeated failed convergence) records an escalation notification', async () => {
  const stores = tempStores()
  stores.settings.insert({ maxFailStreak: 1 })
  const intent = makeIntent(stores, { lastRunId: 'prior-run', failStreak: 0 })

  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: 'still broken' }),
  })
  assert.equal(result.lastStatus, 'decision-needed')
  const escalations = stores.notifications.list().filter((n) => n.type === 'escalation')
  assert.equal(escalations.length, 1)
  assert.equal(escalations[0].intentId, intent.id)
  cleanup(stores.home)
})

test('a manager reply records a manager-message notification', async () => {
  const stores = tempStores()
  const children = []
  const fakeSpawn = () => {
    const child = fakeChild()
    children.push(child)
    return child
  }
  const events = []
  const promise = sendChatMessage(
    stores,
    { projectPath: GLOBAL_CHAT, message: 'status?', port: 4747 },
    (e) => events.push(e),
    fakeSpawn
  )
  await finishTurn(children[0], [
    { type: 'system', subtype: 'init', session_id: 'sess-1' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'All green.' }] } },
    { type: 'result', session_id: 'sess-1' },
  ])
  await promise

  const match = stores.notifications.list().find((n) => n.type === 'manager-message')
  assert.ok(match, 'expected a manager-message notification')
  assert.equal(match.projectPath, null) // global chat has no single project
  assert.match(match.body, /All green/)
  cleanup(stores.home)
})
