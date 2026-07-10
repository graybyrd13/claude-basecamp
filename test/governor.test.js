import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/lib/store.js'
import { monthKey, ledgerBump, spendReport, admitRun, backoffUntil } from '../src/lib/governor.js'

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-governor-'))
  return {
    home,
    runs: new Store(home, 'runs'),
    ledger: new Store(home, 'ledger'),
    settings: new Store(home, 'settings'),
  }
}

const cleanup = (stores) => rmSync(stores.home, { recursive: true, force: true })

test('monthKey formats a UTC-independent local year-month', () => {
  const june = new Date(2026, 5, 15).getTime()
  assert.equal(monthKey(june), '2026-06')
  const december = new Date(2026, 11, 3).getTime()
  assert.equal(monthKey(december), '2026-12')
})

test('ledgerBump accrues each run once and survives repeat calls', () => {
  const stores = tempStores()
  const run = stores.runs.insert({
    projectPath: '/repo/a',
    intentId: 'intent-1',
    costUsd: 0.42,
    ledgeredUsd: 0,
  })

  ledgerBump(stores, stores.runs.get(run.id))
  ledgerBump(stores, stores.runs.get(run.id)) // idempotent: already ledgered

  const spend = spendReport(stores)
  assert.equal(spend.totalUsd.toFixed(2), '0.42')
  assert.equal(spend.byRepo['/repo/a'].toFixed(2), '0.42')
  assert.equal(spend.byIntent['intent-1'].toFixed(2), '0.42')
  assert.equal(spend.runs, 1)
  cleanup(stores)
})

test('ledgerBump accrues only the delta after an approval continuation', () => {
  const stores = tempStores()
  const run = stores.runs.insert({ projectPath: '/repo/a', costUsd: 0.3, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(run.id))

  // Approval resumes the run; the next result reports cumulative cost.
  stores.runs.update(run.id, { costUsd: 0.5 })
  ledgerBump(stores, stores.runs.get(run.id))

  const spend = spendReport(stores)
  assert.equal(spend.totalUsd.toFixed(2), '0.50')
  assert.equal(spend.runs, 1) // still one run, not two
  cleanup(stores)
})

test('spendReport reads the durable ledger, not the capped runs list', () => {
  const stores = tempStores()
  const run = stores.runs.insert({ projectPath: '/repo/a', costUsd: 1.5, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(run.id))
  stores.runs.remove(run.id) // run record evicted — spend must persist

  const spend = spendReport(stores)
  assert.equal(spend.totalUsd.toFixed(2), '1.50')
  cleanup(stores)
})

test('admitRun allows runs when no caps are set', () => {
  const stores = tempStores()
  const verdict = admitRun(stores, { projectPath: '/repo/a' })
  assert.equal(verdict.ok, true)
  cleanup(stores)
})

test('admitRun blocks on the global monthly cap', () => {
  const stores = tempStores()
  stores.settings.insert({ monthlyBudgetUsd: 1 })
  const run = stores.runs.insert({ projectPath: '/repo/a', costUsd: 1.2, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(run.id))

  const verdict = admitRun(stores, { projectPath: '/repo/b' })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.budget, true)
  assert.match(verdict.reason, /\$1(\.00)?\b.*month/i)
  cleanup(stores)
})

test('admitRun blocks a repo at its own cap but leaves other repos free', () => {
  const stores = tempStores()
  stores.settings.insert({ repoBudgetsUsd: { '/repo/a': 0.5 } })
  const run = stores.runs.insert({ projectPath: '/repo/a', costUsd: 0.6, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(run.id))

  assert.equal(admitRun(stores, { projectPath: '/repo/a' }).ok, false)
  assert.equal(admitRun(stores, { projectPath: '/repo/b' }).ok, true)
  cleanup(stores)
})

test('spend from a previous month never blocks this month', () => {
  const stores = tempStores()
  stores.settings.insert({ monthlyBudgetUsd: 1 })
  const lastMonth = new Date()
  lastMonth.setMonth(lastMonth.getMonth() - 1)
  const run = stores.runs.insert({ projectPath: '/repo/a', costUsd: 9, ledgeredUsd: 0 })
  ledgerBump(stores, stores.runs.get(run.id), lastMonth.getTime())

  assert.equal(admitRun(stores, { projectPath: '/repo/a' }).ok, true)
  cleanup(stores)
})

test('backoffUntil grows exponentially with the fail streak and caps at 24h', () => {
  const now = 1_000_000
  const interval = 60 // minutes
  const first = backoffUntil(1, interval, now)
  const second = backoffUntil(2, interval, now)
  assert.equal(first - now, 2 * 60 * 60 * 1000) // 60m * 2^1
  assert.equal(second - now, 4 * 60 * 60 * 1000) // 60m * 2^2
  const huge = backoffUntil(10, interval, now)
  assert.equal(huge - now, 24 * 60 * 60 * 1000) // capped
})
