import { spawn } from 'node:child_process'
import { createWriteStream, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { sanitizedEnv } from './env.js'
import { headSha, commitsBetween } from './git.js'
import { notifyRunFinished, sendNotification } from './notify.js'
import { lastPathSegment } from './paths.js'
import { ledgerBump } from './governor.js'
import { createCleanRoom, cleanRoomDiff } from './cleanroom.js'

const DEFAULT_TIMEOUT_MINUTES = 30
const OUTPUT_TAIL_CHARS = 4000
export const ALLOWED_PERMISSION_MODES = new Set(['default', 'plan', 'acceptEdits', 'bypassPermissions'])
// The claude CLI's --effort levels, in ascending order (see `claude --help`).
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
// Aliases like "opus" and full ids like "claude-sonnet-5" — but nothing the
// Windows shell path (spawn with shell: true) could reinterpret.
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// In-memory registry of live child processes, keyed by run id.
const liveProcesses = new Map()

/**
 * Spawn one `claude -p` turn for an existing run record and wire its
 * lifecycle back into the store. Shared by launchRun (fresh run) and
 * approveRun (resuming a run that paused on a permission wall) — both just
 * differ in the prompt/permission-mode/session they hand in.
 */
function spawnTurn(stores, run, { prompt, permissionMode, model, effort, timeoutMinutes, startShaPromise, resumeSessionId, allowedTools, cwd, spawnFn }) {
  const logPath = join(stores.home, 'logs', `${run.id}.log`)
  const logStream = createWriteStream(logPath, { flags: 'a' })
  // Readline can flush buffered lines after the exit handler has ended the
  // stream; a write-after-end must not crash the process over a log line.
  logStream.on('error', () => {})
  const log = (chunk) => {
    if (!logStream.writableEnded) logStream.write(chunk)
  }

  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
  if (resumeSessionId) args.push('--resume', resumeSessionId)
  if (permissionMode !== 'default') args.push('--permission-mode', permissionMode)
  if (model) args.push('--model', model)
  if (effort) args.push('--effort', effort)
  if (allowedTools && allowedTools.length) args.push('--allowedTools', allowedTools.join(','))

  const child = spawnFn('claude', args, {
    // Clean-room runs work inside their worktree, never the user's checkout.
    cwd: cwd || run.cleanRoom?.path || run.projectPath,
    env: sanitizedEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    // On Windows, globally-installed npm bins resolve to a .cmd/.ps1 shim,
    // which Windows can only execute through a shell — spawn() without this
    // fails with ENOENT even though `claude` is right there on PATH.
    shell: process.platform === 'win32',
  })
  liveProcesses.set(run.id, child)

  const timeout = setTimeout(() => {
    log(`\n[basecamp] run timed out after ${timeoutMinutes} minutes, killing\n`)
    child.kill('SIGTERM')
  }, timeoutMinutes * 60 * 1000)

  let lastAssistantText = null
  let permissionDenials = []
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  rl.on('line', (line) => {
    log(line + '\n')
    let event
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.type === 'system' && event.session_id) {
      stores.runs.update(run.id, { sessionId: event.session_id })
    }
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      const text = event.message.content.find((p) => p.type === 'text')?.text
      if (text) lastAssistantText = text
    }
    if (event.type === 'result') {
      if (Array.isArray(event.permission_denials)) permissionDenials = event.permission_denials
      const current = stores.runs.get(run.id)
      // Cost accumulates across approval continuations: prior turns are
      // already ledgered, and this result reports only its own invocation.
      const costUsd =
        event.total_cost_usd == null
          ? current?.costUsd ?? null
          : (Number(current?.ledgeredUsd) || 0) + event.total_cost_usd
      stores.runs.update(run.id, {
        resultText: (event.result || lastAssistantText || '').slice(0, OUTPUT_TAIL_CHARS),
        costUsd,
        numTurns: event.num_turns ?? null,
        sessionId: event.session_id || current?.sessionId || null,
      })
    }
  })

  child.stderr.on('data', (chunk) => log(chunk))

  child.on('error', (err) => {
    clearTimeout(timeout)
    liveProcesses.delete(run.id)
    log(`\n[basecamp] failed to launch claude: ${err.message}\n`)
    logStream.end()
    const failed = stores.runs.update(run.id, {
      status: 'failed',
      endedAt: Date.now(),
      error:
        err.code === 'ENOENT'
          ? 'claude CLI not found on PATH — install Claude Code first'
          : err.message,
    })
    recordRunUpdate(stores, failed)
  })

  child.on('exit', async (code, signal) => {
    clearTimeout(timeout)
    liveProcesses.delete(run.id)
    logStream.end()
    const current = stores.runs.get(run.id)
    if (!current || current.status !== 'running') return

    if (code === 0 && permissionDenials.length > 0) {
      const paused = stores.runs.update(run.id, { status: 'awaiting-approval', permissionDenials })
      recordAwaitingApproval(stores, paused)
      return
    }

    let commits = []
    const room = stores.runs.get(run.id)?.cleanRoom
    try {
      if (room) {
        // Clean-room work lives on its branch; summarize it for the review card.
        const diff = await cleanRoomDiff(run.projectPath, room)
        commits = diff.commits
        stores.runs.update(run.id, {
          cleanRoom: { ...room, stat: diff.stat, commitCount: diff.commits.length },
        })
      } else {
        const startSha = await startShaPromise
        commits = await commitsBetween(run.projectPath, startSha, await headSha(run.projectPath))
      }
    } catch {
      /* not a repo, or git unavailable — linkage is best-effort */
    }

    const finished = stores.runs.update(run.id, {
      status: code === 0 ? 'succeeded' : 'failed',
      endedAt: Date.now(),
      commits,
      error: code === 0 ? null : signal ? `killed (${signal})` : `exited with code ${code}`,
    })
    recordRunUpdate(stores, finished)
  })
}

/**
 * Launch a headless Claude Code run: `claude -p` in the project directory.
 * Progress is streamed to <home>/logs/<runId>.log; the run record in the store is
 * updated as events arrive and when the process exits. If Claude hits a
 * permission wall it can't clear headlessly, the run pauses as
 * "awaiting-approval" instead of failing — see approveRun/denyRun.
 */
export function launchRun(stores, options, spawnFn = spawn) {
  const {
    projectPath,
    prompt,
    permissionMode = 'acceptEdits',
    model = null,
    effort = null,
    routineId = null,
    routineName = null,
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
    // Session Rescue: resume a dead session's context instead of starting fresh.
    resumeSessionId = null,
    rescuedSessionId = null,
    allowedTools = null,
    intentId = null,
    // 'worktree' puts the run in a clean room: an isolated git worktree whose
    // commits come back for review instead of landing in the user's checkout.
    isolation = null,
  } = options

  if (!projectPath || !existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`)
  }
  if (!prompt || !prompt.trim()) {
    throw new Error('Prompt is required')
  }
  if (!ALLOWED_PERMISSION_MODES.has(permissionMode)) {
    throw new Error(`Invalid permission mode: ${permissionMode}`)
  }
  if (model !== null && (typeof model !== 'string' || !MODEL_NAME_PATTERN.test(model))) {
    throw new Error(`Invalid model: ${model}`)
  }
  if (effort !== null && !EFFORT_LEVELS.includes(effort)) {
    throw new Error(`Invalid effort: ${effort}`)
  }

  const run = stores.runs.insert({
    projectPath,
    prompt,
    permissionMode,
    model,
    effort,
    routineId,
    routineName,
    status: 'running',
    startedAt: Date.now(),
    endedAt: null,
    resultText: null,
    costUsd: null,
    numTurns: null,
    sessionId: null,
    error: null,
    commits: [],
    permissionDenials: [],
    rescuedSessionId,
    intentId,
    ledgeredUsd: 0,
    cleanRoom: null,
  })

  const turnOptions = {
    prompt,
    permissionMode,
    model,
    effort,
    timeoutMinutes,
    resumeSessionId,
    allowedTools,
    spawnFn,
  }

  if (isolation === 'worktree') {
    // Room setup is async; the run record exists immediately either way.
    createCleanRoom(stores, run.id, projectPath)
      .then((room) => {
        const roomed = stores.runs.update(run.id, { cleanRoom: room })
        spawnTurn(stores, roomed, { ...turnOptions, cwd: room.path, startShaPromise: Promise.resolve(room.baseSha) })
      })
      .catch((err) => {
        const failed = stores.runs.update(run.id, {
          status: 'failed',
          endedAt: Date.now(),
          error: `Clean room setup failed: ${err.message}`,
        })
        recordRunUpdate(stores, failed)
      })
    return run
  }

  // Snapshot HEAD so commits made by this run can be linked to it afterwards.
  spawnTurn(stores, run, { ...turnOptions, startShaPromise: headSha(projectPath) })

  return run
}

function approvalPrompt(denials) {
  if (!denials.length) return 'You have been granted permission to proceed. Continue the task.'
  const list = denials.map((d) => `- ${d.tool_name} with input ${JSON.stringify(d.tool_input)}`).join('\n')
  return `The user has approved the tool use(s) below that were previously denied. Proceed with them now, then continue the task:\n${list}`
}

function describeDenial(denial) {
  const input = denial.tool_input || {}
  if (denial.tool_name === 'Bash') return `Bash: ${String(input.command || '').slice(0, 200)}`
  if (input.file_path) return `${denial.tool_name}: ${input.file_path}`
  const hasInput = input && Object.keys(input).length > 0
  return `${denial.tool_name}${hasInput ? ' ' + JSON.stringify(input).slice(0, 200) : ''}`
}

/**
 * Resume a run that's paused on a permission wall, granting it one-time
 * elevated permission (bypassPermissions) to carry out exactly what it asked
 * for. Reuses the same run record and session, so chat/log history stays
 * intact — only this continuation turn gets the elevated grant.
 */
export function approveRun(stores, runId, options = {}, spawnFn = spawn) {
  const run = stores.runs.get(runId)
  if (!run) throw new Error('Run not found')
  if (run.status !== 'awaiting-approval') throw new Error('Run must be awaiting approval to approve')
  if (!run.sessionId) throw new Error('Run has no resumable session and cannot be approved')

  const denials = run.permissionDenials || []
  const prompt = options.prompt || approvalPrompt(denials)
  const startShaPromise = headSha(run.projectPath)

  const resumed = stores.runs.update(run.id, {
    status: 'running',
    permissionDenials: [],
  })

  spawnTurn(stores, resumed, {
    prompt,
    permissionMode: 'bypassPermissions',
    model: run.model,
    effort: run.effort,
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    startShaPromise,
    resumeSessionId: run.sessionId,
    spawnFn,
  })

  return resumed
}

/** Deny a paused run. No process to stop — it already exited after the denial. */
export function denyRun(stores, runId) {
  const run = stores.runs.get(runId)
  if (!run) throw new Error('Run not found')
  if (run.status !== 'awaiting-approval') throw new Error('Run must be awaiting approval to deny')

  const denied = stores.runs.update(run.id, {
    status: 'denied',
    endedAt: Date.now(),
    error: 'Approval denied by user',
  })
  recordRunUpdate(stores, denied)
  return denied
}

function recordRunUpdate(stores, run) {
  if (!run) return
  ledgerBump(stores, run)
  const label = run.routineName ? `Routine “${run.routineName}”` : 'Task'
  const projectName = lastPathSegment(run.projectPath)
  const kind = run.status === 'succeeded' ? 'run-succeeded' : run.status === 'denied' ? 'run-denied' : 'run-failed'
  const verb = run.status === 'succeeded' ? 'finished' : run.status === 'denied' ? 'was denied' : 'failed'
  stores.updates.insert({
    kind,
    runId: run.id,
    projectPath: run.projectPath,
    title: `${label} ${verb} in ${projectName}`,
    body: run.resultText || run.error || null,
    costUsd: run.costUsd,
    commits: run.commits || [],
  })
  notifyRunFinished(stores, run)
}

function recordAwaitingApproval(stores, run) {
  ledgerBump(stores, run)
  const label = run.routineName ? `Routine “${run.routineName}”` : 'Task'
  const projectName = lastPathSegment(run.projectPath)
  const denial = (run.permissionDenials || [])[0]
  const requested = denial ? describeDenial(denial) : 'a tool call'
  stores.updates.insert({
    kind: 'run-awaiting-approval',
    runId: run.id,
    projectPath: run.projectPath,
    title: `${label} in ${projectName} needs approval`,
    body: `Requested: ${requested}`,
    costUsd: run.costUsd,
    commits: [],
  })
  sendNotification(stores, {
    title: `${label} needs approval in ${projectName}`,
    body: requested,
  }).catch(() => {})
}

/** Stop a running run. Returns true if a live process was signalled. */
export function stopRun(stores, runId) {
  const child = liveProcesses.get(runId)
  if (!child) return false
  child.kill('SIGTERM')
  // A mid-flight result may already carry cost; ledger it before the status
  // change makes the exit handler bail out, or the spend is silently lost.
  ledgerBump(stores, stores.runs.get(runId))
  stores.runs.update(runId, { status: 'stopped', endedAt: Date.now(), error: 'stopped by user' })
  liveProcesses.delete(runId)
  return true
}

/** Read the tail of a run's log file. */
export function readRunLog(stores, runId, maxChars = 20000) {
  const logPath = join(stores.home, 'logs', `${runId}.log`)
  if (!existsSync(logPath)) return ''
  const content = readFileSync(logPath, 'utf8')
  return content.length > maxChars ? content.slice(-maxChars) : content
}

export function runningCount() {
  return liveProcesses.size
}
