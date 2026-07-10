import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/lib/store.js'
import { reconcileIntent, reconcileDue, intentReport, BUILTINS } from '../src/lib/reconcile.js'
import { detectTestCommand } from '../src/lib/checks.js'
import { ledgerBump } from '../src/lib/governor.js'

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-reconcile-'))
  mkdirSync(join(home, 'logs'), { recursive: true })
  return {
    home,
    intents: new Store(home, 'intents'),
    runs: new Store(home, 'runs'),
    updates: new Store(home, 'updates'),
    settings: new Store(home, 'settings'),
    ledger: new Store(home, 'ledger'),
    notifications: new Store(home, 'notifications'),
  }
}

function makeIntent(stores, overrides = {}) {
  return stores.intents.insert({
    projectPath: overrides.projectPath || mkdtempSync(join(tmpdir(), 'basecamp-repo-')),
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

const fakeLaunch = (calls) => (stores, options) => {
  calls.push(options)
  return stores.runs.insert({ ...options, status: 'running', startedAt: Date.now() })
}

test('holding: a passing check records status and resets the fail streak', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores, { failStreak: 1 })
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'holding', detail: 'green' }),
  })
  assert.equal(result.lastStatus, 'holding')
  assert.equal(result.failStreak, 0)
  assert.ok(result.lastCheck)
  rmSync(stores.home, { recursive: true, force: true })
})

test('drifting: launches a convergence run and marks converging', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores)
  const calls = []
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: '2 tests failing' }),
    launch: fakeLaunch(calls),
  })
  assert.equal(result.lastStatus, 'converging')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].intentId, intent.id)
  assert.match(calls[0].prompt, /test suite is failing/i)
  assert.ok(result.lastRunId)
  rmSync(stores.home, { recursive: true, force: true })
})

test('converging: waits while the convergence run is still in flight', async () => {
  const stores = tempStores()
  const run = stores.runs.insert({ status: 'running', startedAt: Date.now() })
  const intent = makeIntent(stores, { lastRunId: run.id, lastStatus: 'converging' })
  let checked = false
  const result = await reconcileIntent(stores, intent, {
    check: async () => {
      checked = true
      return { status: 'holding' }
    },
  })
  assert.equal(result.lastStatus, 'converging')
  assert.equal(checked, false)
  rmSync(stores.home, { recursive: true, force: true })
})

test('escalation: repeated failed convergence becomes a human decision, never silent', async () => {
  const stores = tempStores()
  const failedRun = stores.runs.insert({ status: 'succeeded', startedAt: Date.now() })
  const intent = makeIntent(stores, { lastRunId: failedRun.id, failStreak: 1 })
  const calls = []
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: 'still failing' }),
    launch: fakeLaunch(calls),
  })
  assert.equal(result.lastStatus, 'decision-needed')
  assert.equal(calls.length, 0)
  const updates = stores.updates.list()
  assert.equal(updates[0].kind, 'decision-needed')
  assert.match(updates[0].title, /Decision needed/)
  rmSync(stores.home, { recursive: true, force: true })
})

test('decision-needed from the check escalates directly', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores, { builtin: null, text: 'ship v1 by March', label: 'ship v1 by March' })
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'decision-needed', detail: 'scope choice required' }),
  })
  assert.equal(result.lastStatus, 'decision-needed')
  rmSync(stores.home, { recursive: true, force: true })
})

test('daily budget: exhausting convergence attempts escalates instead of burning tokens', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores)
  for (let i = 0; i < 6; i++) {
    stores.runs.insert({ intentId: intent.id, status: 'succeeded', startedAt: Date.now() - i * 1000 })
  }
  const calls = []
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: 'still red' }),
    launch: fakeLaunch(calls),
  })
  assert.equal(calls.length, 0)
  assert.equal(result.lastStatus, 'decision-needed')
  assert.match(stores.updates.list()[0].body, /budget/i)
  rmSync(stores.home, { recursive: true, force: true })
})

test('missing repo path marks unknown without launching anything', async () => {
  const stores = tempStores()
  const intent = makeIntent(stores, { projectPath: '/definitely/not/a/real/path' })
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: 'x' }),
  })
  assert.equal(result.lastStatus, 'unknown')
  rmSync(stores.home, { recursive: true, force: true })
})

test('reconcileDue respects intervals and skips disabled intents', async () => {
  const stores = tempStores()
  const due = makeIntent(stores, { lastCheck: Date.now() - 61 * 60 * 1000 })
  makeIntent(stores, { lastCheck: Date.now() - 5 * 60 * 1000 }) // not due
  makeIntent(stores, { enabled: false, lastCheck: null }) // disabled
  const results = await reconcileDue(stores, {
    check: async () => ({ status: 'holding', detail: 'ok' }),
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].id, due.id)
  rmSync(stores.home, { recursive: true, force: true })
})

test('intentReport aggregates statuses', () => {
  const stores = tempStores()
  makeIntent(stores, { lastStatus: 'holding' })
  makeIntent(stores, { lastStatus: 'drifting' })
  makeIntent(stores, { lastStatus: 'decision-needed', lastDetail: 'pick one' })
  makeIntent(stores, { enabled: false, lastStatus: 'holding' })
  const report = intentReport(stores)
  assert.equal(report.total, 3)
  assert.equal(report.holding, 1)
  assert.equal(report.drifting, 1)
  assert.equal(report.decisions.length, 1)
  rmSync(stores.home, { recursive: true, force: true })
})

test('a failed attempt is accounted once, not re-counted every later cycle', async () => {
  const stores = tempStores()
  const failedRun = stores.runs.insert({ status: 'succeeded', startedAt: Date.now() })
  const intent = makeIntent(stores, { lastRunId: failedRun.id, failStreak: 0 })
  const drift = { check: async () => ({ status: 'drifting', detail: 'red' }), launch: fakeLaunch([]) }

  let result = await reconcileIntent(stores, intent, drift)
  assert.equal(result.failStreak, 1)
  assert.equal(result.lastRunId, null)

  result = await reconcileIntent(stores, stores.intents.get(intent.id), drift)
  assert.equal(result.failStreak, 1) // same failure, one count — never inflated
  rmSync(stores.home, { recursive: true, force: true })
})

test('backoff: after a failed attempt the next launch waits, checks keep running', async () => {
  const stores = tempStores()
  const failedRun = stores.runs.insert({ status: 'succeeded', startedAt: Date.now() })
  const intent = makeIntent(stores, { lastRunId: failedRun.id })
  const calls = []
  const result = await reconcileIntent(stores, intent, {
    check: async () => ({ status: 'drifting', detail: 'still red' }),
    launch: fakeLaunch(calls),
  })
  assert.equal(calls.length, 0)
  assert.equal(result.lastStatus, 'drifting')
  assert.match(result.lastDetail, /backing off/i)
  assert.ok(result.nextConvergeAt > Date.now())
  rmSync(stores.home, { recursive: true, force: true })
})

test('budget exhausted: intent pauses with one card, not one per cycle', async () => {
  const stores = tempStores()
  stores.settings.insert({ monthlyBudgetUsd: 1 })
  const spent = stores.runs.insert({ projectPath: '/repo', costUsd: 2, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(spent.id))

  const intent = makeIntent(stores)
  const calls = []
  const drift = { check: async () => ({ status: 'drifting', detail: 'red' }), launch: fakeLaunch(calls) }

  let result = await reconcileIntent(stores, intent, drift)
  assert.equal(result.lastStatus, 'budget-paused')
  assert.equal(calls.length, 0)
  assert.match(result.lastDetail, /budget/i)

  await reconcileIntent(stores, stores.intents.get(intent.id), drift)
  const cards = stores.updates.list().filter((u) => u.title.startsWith('Budget paused'))
  assert.equal(cards.length, 1)
  rmSync(stores.home, { recursive: true, force: true })
})

test('a clean-room fix awaiting review reads as fix-ready, not drift', async () => {
  const stores = tempStores()
  const run = stores.runs.insert({
    status: 'succeeded',
    cleanRoom: { state: 'open', commitCount: 2, stat: '2 files changed' },
  })
  const intent = makeIntent(stores, { lastRunId: run.id, lastStatus: 'converging' })

  let checked = false
  const calls = []
  let result = await reconcileIntent(stores, intent, {
    check: async () => {
      checked = true
      return { status: 'drifting', detail: 'x' }
    },
    launch: fakeLaunch(calls),
  })
  assert.equal(result.lastStatus, 'fix-ready')
  assert.equal(checked, false) // parked for review: no check, no relaunch
  assert.equal(calls.length, 0)
  assert.equal(result.failStreak, 0) // a waiting fix is not a failed attempt
  assert.equal(stores.updates.list().filter((u) => u.kind === 'fix-ready').length, 1)

  // Next cycle: still parked, no duplicate card.
  await reconcileIntent(stores, stores.intents.get(intent.id), {
    check: async () => ({ status: 'drifting', detail: 'x' }),
    launch: fakeLaunch(calls),
  })
  assert.equal(stores.updates.list().filter((u) => u.kind === 'fix-ready').length, 1)
  rmSync(stores.home, { recursive: true, force: true })
})

test('applied rooms verify on the real tree; discarded rooms count as a failed attempt', async () => {
  const stores = tempStores()

  const appliedRun = stores.runs.insert({ status: 'succeeded', cleanRoom: { state: 'applied', commitCount: 2 } })
  const verified = makeIntent(stores, { lastRunId: appliedRun.id })
  const afterApply = await reconcileIntent(stores, verified, {
    check: async () => ({ status: 'holding', detail: 'green again' }),
  })
  assert.equal(afterApply.lastStatus, 'holding')
  assert.equal(afterApply.failStreak, 0)

  const discardedRun = stores.runs.insert({ status: 'succeeded', cleanRoom: { state: 'discarded', commitCount: 2 } })
  const rejected = makeIntent(stores, { lastRunId: discardedRun.id })
  const afterDiscard = await reconcileIntent(stores, rejected, {
    check: async () => ({ status: 'drifting', detail: 'still red' }),
    launch: fakeLaunch([]),
  })
  assert.equal(afterDiscard.failStreak, 1) // the human rejected it — that attempt failed
  rmSync(stores.home, { recursive: true, force: true })
})

test('propose intents converge in a clean room; apply intents in the checkout', async () => {
  const stores = tempStores()
  const calls = []
  const drift = { check: async () => ({ status: 'drifting', detail: 'red' }), launch: fakeLaunch(calls) }

  await reconcileIntent(stores, makeIntent(stores, { autonomy: 'propose' }), drift)
  assert.equal(calls[0].isolation, 'worktree')

  await reconcileIntent(stores, makeIntent(stores, { autonomy: 'apply' }), drift)
  assert.equal(calls[1].isolation, null)
  rmSync(stores.home, { recursive: true, force: true })
})

test('every builtin has a label, check, and fix prompt', () => {
  for (const [id, b] of Object.entries(BUILTINS)) {
    assert.ok(b.label, id)
    assert.equal(typeof b.check, 'function', id)
    assert.match(b.fixPrompt('detail'), /detail/)
  }
})

test('detectTestCommand finds npm test scripts and ignores the placeholder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-detect-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
  assert.deepEqual(detectTestCommand(dir), { cmd: 'npm', args: ['test'] })

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }))
  assert.equal(detectTestCommand(dir), null)
  rmSync(dir, { recursive: true, force: true })
})
