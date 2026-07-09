import { spawn } from 'node:child_process'
import { createWriteStream, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { sanitizedEnv } from './env.js'
import { headSha, commitsBetween } from './git.js'

const DEFAULT_TIMEOUT_MINUTES = 30
const OUTPUT_TAIL_CHARS = 4000
const ALLOWED_PERMISSION_MODES = new Set(['default', 'plan', 'acceptEdits', 'bypassPermissions'])

// In-memory registry of live child processes, keyed by run id.
const liveProcesses = new Map()

/**
 * Launch a headless Claude Code run: `claude -p <prompt>` in the project directory.
 * Progress is streamed to <home>/logs/<runId>.log; the run record in the store is
 * updated as events arrive and when the process exits.
 */
export function launchRun(stores, options) {
  const {
    projectPath,
    prompt,
    permissionMode = 'acceptEdits',
    model = null,
    routineId = null,
    routineName = null,
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
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

  const run = stores.runs.insert({
    projectPath,
    prompt,
    permissionMode,
    model,
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
  })

  // Snapshot HEAD so commits made by this run can be linked to it afterwards.
  const startShaPromise = headSha(projectPath)

  const logPath = join(stores.home, 'logs', `${run.id}.log`)
  const logStream = createWriteStream(logPath)

  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
  if (permissionMode !== 'default') args.push('--permission-mode', permissionMode)
  if (model) args.push('--model', model)

  const child = spawn('claude', args, {
    cwd: projectPath,
    env: sanitizedEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  liveProcesses.set(run.id, child)

  const timeout = setTimeout(() => {
    logStream.write(`\n[basecamp] run timed out after ${timeoutMinutes} minutes, killing\n`)
    child.kill('SIGTERM')
  }, timeoutMinutes * 60 * 1000)

  let lastAssistantText = null
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  rl.on('line', (line) => {
    logStream.write(line + '\n')
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
      stores.runs.update(run.id, {
        resultText: (event.result || lastAssistantText || '').slice(0, OUTPUT_TAIL_CHARS),
        costUsd: event.total_cost_usd ?? null,
        numTurns: event.num_turns ?? null,
        sessionId: event.session_id || stores.runs.get(run.id)?.sessionId || null,
      })
    }
  })

  child.stderr.on('data', (chunk) => logStream.write(chunk))

  child.on('error', (err) => {
    clearTimeout(timeout)
    liveProcesses.delete(run.id)
    logStream.end(`\n[basecamp] failed to launch claude: ${err.message}\n`)
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

    let commits = []
    try {
      const startSha = await startShaPromise
      commits = await commitsBetween(projectPath, startSha, await headSha(projectPath))
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

  return run
}

function recordRunUpdate(stores, run) {
  if (!run) return
  const label = run.routineName ? `Routine “${run.routineName}”` : 'Task'
  const projectName = run.projectPath.split('/').filter(Boolean).pop()
  stores.updates.insert({
    kind: run.status === 'succeeded' ? 'run-succeeded' : 'run-failed',
    runId: run.id,
    projectPath: run.projectPath,
    title:
      run.status === 'succeeded'
        ? `${label} finished in ${projectName}`
        : `${label} failed in ${projectName}`,
    body: run.resultText || run.error || null,
    costUsd: run.costUsd,
    commits: run.commits || [],
  })
}

/** Stop a running run. Returns true if a live process was signalled. */
export function stopRun(stores, runId) {
  const child = liveProcesses.get(runId)
  if (!child) return false
  child.kill('SIGTERM')
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
