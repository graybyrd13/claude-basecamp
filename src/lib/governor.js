import { getSettings } from './settings.js'

/**
 * The governor: resource accounting and admission control for autonomous runs.
 *
 * Every run's cost comes from the claude CLI's own result events (real
 * dollars, not estimates) and accrues into a durable monthly ledger — one
 * record per calendar month — so spend survives run-record eviction. Before
 * the reconciler or scheduler launches a run, it asks the governor whether
 * the month's budget allows it.
 */

const HOUR_MS = 60 * 60 * 1000
const BACKOFF_CAP_MS = 24 * HOUR_MS

/** Local calendar month, e.g. "2026-07". Budgets reset when this rolls over. */
export function monthKey(ts = Date.now()) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ledgerRecord(stores, month) {
  return (
    stores.ledger.list().find((r) => r.month === month) ||
    stores.ledger.insert({ month, totalUsd: 0, runs: 0, byRepo: {}, byIntent: {}, byRoutine: {} })
  )
}

/**
 * Accrue a run's cost into the monthly ledger. Idempotent: only the delta
 * since the run was last ledgered is added, so repeat calls — and approval
 * continuations that raise the run's cumulative cost — each count once.
 */
export function ledgerBump(stores, run, now = Date.now()) {
  if (!run) return
  const cost = Number(run.costUsd) || 0
  const ledgered = Number(run.ledgeredUsd) || 0
  const delta = cost - ledgered
  if (delta <= 0) return

  const record = ledgerRecord(stores, monthKey(now))
  const addTo = (bucket, key) =>
    key ? { ...bucket, [key]: (Number(bucket?.[key]) || 0) + delta } : bucket || {}
  stores.ledger.update(record.id, {
    totalUsd: (Number(record.totalUsd) || 0) + delta,
    runs: (Number(record.runs) || 0) + (ledgered === 0 ? 1 : 0),
    byRepo: addTo(record.byRepo, run.projectPath),
    byIntent: addTo(record.byIntent, run.intentId),
    byRoutine: addTo(record.byRoutine, run.routineId),
  })
  stores.runs.update(run.id, { ledgeredUsd: cost })
}

/** Month-to-date spend, straight from the ledger. */
export function spendReport(stores, now = Date.now()) {
  const month = monthKey(now)
  const record = stores.ledger.list().find((r) => r.month === month)
  return {
    month,
    totalUsd: Number(record?.totalUsd) || 0,
    runs: Number(record?.runs) || 0,
    byRepo: record?.byRepo || {},
    byIntent: record?.byIntent || {},
    byRoutine: record?.byRoutine || {},
  }
}

/**
 * May an autonomous run launch right now? Checks the month's global and
 * per-repo budgets. A cap of 0 (or unset) means "no cap".
 */
export function admitRun(stores, { projectPath }, now = Date.now()) {
  const settings = getSettings(stores)
  const spend = spendReport(stores, now)

  const globalCap = Number(settings.monthlyBudgetUsd) || 0
  if (globalCap > 0 && spend.totalUsd >= globalCap) {
    return {
      ok: false,
      budget: true,
      reason: `Monthly budget reached: $${spend.totalUsd.toFixed(2)} of $${globalCap} spent this month`,
    }
  }

  const repoCap = Number(settings.repoBudgetsUsd?.[projectPath]) || 0
  const repoSpend = Number(spend.byRepo[projectPath]) || 0
  if (repoCap > 0 && repoSpend >= repoCap) {
    return {
      ok: false,
      budget: true,
      reason: `Repository budget reached: $${repoSpend.toFixed(2)} of $${repoCap} spent this month`,
    }
  }

  return { ok: true }
}

/**
 * When may the next convergence attempt start after `failStreak` failures?
 * Exponential: interval * 2^streak, capped at 24 hours — a doomed intent
 * must not eat the month's budget retrying.
 */
export function backoffUntil(failStreak, intervalMinutes, now = Date.now()) {
  const base = (Number(intervalMinutes) || 120) * 60 * 1000
  const delay = Math.min(base * 2 ** failStreak, BACKOFF_CAP_MS)
  return now + delay
}
