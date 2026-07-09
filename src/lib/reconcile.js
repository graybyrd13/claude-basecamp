import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { launchRun } from './runner.js'
import { checkTestsGreen, checkDepsFresh, checkBacklog } from './checks.js'
import { sendNotification } from './notify.js'
import { lastPathSegment } from './paths.js'
import { sanitizedEnv } from './env.js'

const TICK_MS = 60 * 1000
const DEFAULT_INTERVAL_MINUTES = 120
const MAX_CONCURRENT_CONVERGENCE_RUNS = 2
const MAX_RUNS_PER_DAY = 6
const FAIL_STREAK_ESCALATION = 2
const CUSTOM_CHECK_TIMEOUT_MS = 4 * 60 * 1000

/**
 * The reconciliation loop. Each intent declares a desired state; the engine
 * continuously: check reality -> detect drift -> launch a gap-closing run ->
 * verify convergence on the next cycle -> repeat. Drift is never silently
 * dropped: repeated failure escalates to a human decision.
 */

// Verifying and committing are intrinsic to any convergence run — without
// these, every run stalls on approval for the exact work it was sent to do.
// Local-only git (no push) plus the common test runners.
const CONVERGENCE_ALLOWED = [
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git add:*)', 'Bash(git commit:*)',
  'Bash(npm test:*)', 'Bash(npm run test:*)', 'Bash(node --test:*)', 'Bash(npx:*)',
  'Bash(cargo test:*)', 'Bash(go test:*)', 'Bash(pytest:*)',
]

export const BUILTINS = {
  'tests-green': {
    label: 'Tests always green',
    check: (intent) => checkTestsGreen(intent.projectPath),
    fixPrompt: (detail) =>
      `This repository's test suite is failing. Recent output:\n\n${detail}\n\nDiagnose the failures, fix them, and re-run the suite until it is green. Commit the fixes with clear messages. Do not weaken or delete tests to make them pass unless a test is objectively wrong — explain if so.`,
    allowedTools: CONVERGENCE_ALLOWED,
  },
  'deps-fresh': {
    label: 'Dependencies current',
    check: (intent) => checkDepsFresh(intent.projectPath),
    fixPrompt: (detail) =>
      `Dependencies are out of date: ${detail}\n\nUpdate outdated dependencies to their latest compatible (minor/patch) versions, run the test suite to verify nothing breaks, and commit. Do NOT perform major-version upgrades — list any available majors with their breaking-change notes in your summary instead.`,
    allowedTools: [...CONVERGENCE_ALLOWED, 'Bash(npm:*)'],
  },
  'backlog-triaged': {
    label: 'Issue backlog triaged',
    check: (intent) => checkBacklog(intent.projectPath),
    fixPrompt: (detail) =>
      `The GitHub issue backlog needs triage: ${detail}\n\nFor each untriaged issue: read it with gh, apply appropriate labels, close obvious duplicates or stale issues with a polite comment, and leave a one-line priority assessment on the rest. Summarize what you triaged.`,
    allowedTools: ['Bash(gh:*)'],
  },
}

/** Evaluate a custom (plain-English) intent with a read-only model call. */
export function checkCustomIntent(intent, spawnFn = spawn) {
  const prompt =
    `Evaluate whether the following standing intent currently HOLDS for this repository.\n` +
    `Intent: "${intent.text}"\n\n` +
    `Inspect the repository as needed (read-only). Then respond with ONLY a JSON object, no other text:\n` +
    `{"status": "holding" | "drifting" | "decision-needed", "detail": "<one line of evidence>", "plan": "<if drifting: the concrete work that would close the gap>"}\n` +
    `Use "decision-needed" only when closing the gap requires a choice only the repository owner can make.`
  return new Promise((resolve) => {
    const child = spawnFn(
      'claude',
      ['-p', prompt, '--output-format', 'json', '--permission-mode', 'plan'],
      {
        cwd: intent.projectPath,
        env: sanitizedEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }
    )
    let out = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), CUSTOM_CHECK_TIMEOUT_MS)
    child.stdout.on('data', (c) => (out += c))
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ status: 'unknown', detail: 'claude CLI not available for intent check' })
    })
    child.on('exit', () => {
      clearTimeout(timer)
      try {
        const envelope = JSON.parse(out)
        const text = envelope.result || ''
        const match = text.match(/\{[\s\S]*\}/)
        const verdict = JSON.parse(match ? match[0] : text)
        if (!['holding', 'drifting', 'decision-needed'].includes(verdict.status)) throw new Error('bad status')
        resolve({
          status: verdict.status,
          detail: String(verdict.detail || '').slice(0, 400),
          plan: String(verdict.plan || '').slice(0, 1200),
        })
      } catch {
        resolve({ status: 'unknown', detail: 'Intent check returned unparseable output' })
      }
    })
  })
}

function runsToday(stores, intentId) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  return stores.runs.list().filter((r) => r.intentId === intentId && r.startedAt > dayAgo).length
}

function convergenceRunsLive(stores) {
  return stores.runs.list().filter((r) => r.intentId && r.status === 'running').length
}

function escalate(stores, intent, detail) {
  stores.intents.update(intent.id, { lastStatus: 'decision-needed', lastDetail: detail, failStreak: 0 })
  stores.updates.insert({
    kind: 'decision-needed',
    intentId: intent.id,
    projectPath: intent.projectPath,
    title: `Decision needed: "${intent.label}" in ${lastPathSegment(intent.projectPath)}`,
    body: detail,
  })
  sendNotification(stores, {
    title: `Decision needed in ${lastPathSegment(intent.projectPath)}`,
    body: `${intent.label}: ${detail}`.slice(0, 300),
  }).catch(() => {})
}

/**
 * Reconcile a single intent now. `deps` allows tests to inject check/launch.
 * Status transitions:
 *   holding    — check passed
 *   drifting   — check failed, no capacity/budget to act yet
 *   converging — a gap-closing run is in flight
 *   decision-needed — repeated failure or a genuinely human choice
 */
export async function reconcileIntent(stores, intent, deps = {}) {
  const check = deps.check || (intent.builtin ? BUILTINS[intent.builtin].check : checkCustomIntent)
  const launch = deps.launch || launchRun

  if (!existsSync(intent.projectPath)) {
    stores.intents.update(intent.id, { lastCheck: Date.now(), lastStatus: 'unknown', lastDetail: 'Repository path no longer exists' })
    return stores.intents.get(intent.id)
  }

  // A convergence run is still in flight — judge its outcome by re-checking next cycle.
  const liveRun = intent.lastRunId ? stores.runs.get(intent.lastRunId) : null
  if (liveRun && (liveRun.status === 'running' || liveRun.status === 'awaiting-approval')) {
    stores.intents.update(intent.id, { lastCheck: Date.now(), lastStatus: 'converging' })
    return stores.intents.get(intent.id)
  }

  const result = await check(intent)
  const now = Date.now()

  if (result.status === 'holding') {
    stores.intents.update(intent.id, { lastCheck: now, lastStatus: 'holding', lastDetail: result.detail, failStreak: 0, lastRunId: null })
    return stores.intents.get(intent.id)
  }
  if (result.status === 'unknown') {
    stores.intents.update(intent.id, { lastCheck: now, lastStatus: 'unknown', lastDetail: result.detail })
    return stores.intents.get(intent.id)
  }
  if (result.status === 'decision-needed') {
    escalate(stores, intent, result.detail)
    stores.intents.update(intent.id, { lastCheck: now })
    return stores.intents.get(intent.id)
  }

  // Drifting. Did the previous convergence attempt already fail at this?
  const failStreak = (intent.lastRunId ? (intent.failStreak || 0) + 1 : intent.failStreak || 0)
  if (failStreak >= FAIL_STREAK_ESCALATION) {
    escalate(stores, intent, `${failStreak} convergence attempts did not restore this intent. Latest: ${result.detail}`)
    stores.intents.update(intent.id, { lastCheck: now, lastRunId: null })
    return stores.intents.get(intent.id)
  }

  // Guardrails: bounded concurrency and bounded daily attempts, never silent.
  if (convergenceRunsLive(stores) >= MAX_CONCURRENT_CONVERGENCE_RUNS) {
    stores.intents.update(intent.id, { lastCheck: now, lastStatus: 'drifting', lastDetail: `${result.detail} (queued: convergence capacity in use)`, failStreak })
    return stores.intents.get(intent.id)
  }
  if (runsToday(stores, intent.id) >= MAX_RUNS_PER_DAY) {
    escalate(stores, intent, `Daily convergence budget (${MAX_RUNS_PER_DAY} runs) exhausted while still drifting: ${result.detail}`)
    stores.intents.update(intent.id, { lastCheck: now, lastRunId: null })
    return stores.intents.get(intent.id)
  }

  const builtin = intent.builtin ? BUILTINS[intent.builtin] : null
  const prompt = builtin
    ? builtin.fixPrompt(result.detail)
    : `Standing intent for this repository: "${intent.text}"\nIt is currently drifting: ${result.detail}\n${result.plan ? `Proposed plan: ${result.plan}\n` : ''}Do the work needed to make this intent hold again. Verify your work, and commit changes with clear messages. Finish with a short summary.`

  try {
    const run = launch(stores, {
      projectPath: intent.projectPath,
      prompt,
      permissionMode: 'acceptEdits',
      model: intent.model || 'sonnet',
      routineName: `Intent: ${intent.label}`,
      allowedTools: builtin ? builtin.allowedTools : CONVERGENCE_ALLOWED,
      intentId: intent.id,
    })
    stores.intents.update(intent.id, { lastCheck: now, lastStatus: 'converging', lastDetail: result.detail, lastRunId: run.id, failStreak })
  } catch (err) {
    stores.intents.update(intent.id, { lastCheck: now, lastStatus: 'drifting', lastDetail: `${result.detail} (launch failed: ${err.message})`, failStreak })
  }
  return stores.intents.get(intent.id)
}

/** Reconcile every enabled intent whose interval has elapsed. */
export async function reconcileDue(stores, deps = {}) {
  const now = Date.now()
  const results = []
  for (const intent of stores.intents.list()) {
    if (!intent.enabled) continue
    const interval = (intent.intervalMinutes || DEFAULT_INTERVAL_MINUTES) * 60 * 1000
    const converging = intent.lastStatus === 'converging'
    const due = !intent.lastCheck || now - intent.lastCheck >= (converging ? Math.min(interval, 5 * 60 * 1000) : interval)
    if (!due) continue
    results.push(await reconcileIntent(stores, intent, deps))
  }
  return results
}

export function intentReport(stores) {
  const intents = stores.intents.list().filter((i) => i.enabled)
  return {
    total: intents.length,
    holding: intents.filter((i) => i.lastStatus === 'holding').length,
    drifting: intents.filter((i) => i.lastStatus === 'drifting').length,
    converging: intents.filter((i) => i.lastStatus === 'converging').length,
    decisions: intents.filter((i) => i.lastStatus === 'decision-needed'),
    unknown: intents.filter((i) => !i.lastStatus || i.lastStatus === 'unknown').length,
  }
}

export function startReconciler(stores) {
  const timer = setInterval(() => {
    reconcileDue(stores).catch(() => {})
  }, TICK_MS)
  timer.unref()
  return timer
}
