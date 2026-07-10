import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { sanitizedEnv } from './env.js'
import { ALLOWED_PERMISSION_MODES, EFFORT_LEVELS, MODEL_NAME_PATTERN } from './runner.js'
import { recordNotification } from './notifications.js'
import { lastPathSegment } from './paths.js'

const CHAT_TIMEOUT_MS = 10 * 60 * 1000

// The one manager conversation for the whole machine uses this key in the
// managers/messages stores instead of a repo path.
export const GLOBAL_CHAT = 'global'

// One live manager conversation per target at a time.
const liveChats = new Map()

const chatCwd = (target) => (target === GLOBAL_CHAT ? homedir() : target)

/**
 * The manager's charter. The global manager is ONE persistent agent for the
 * whole machine — it runs from the home directory and can work in any repo
 * or subfolder; per-repo prompts (legacy) scope it to one project. Plus a
 * cookbook for Basecamp's own local API so it can schedule routines, track
 * goals, and launch background runs on request.
 */
export function managerSystemPrompt(target, port, context = '') {
  const api = `http://127.0.0.1:${port}/api`
  const isGlobal = target === GLOBAL_CHAT
  const projectPath = isGlobal ? '<absolute repo path>' : target
  const charter = isGlobal
    ? `You are the Basecamp Manager — one persistent agent for this entire machine.
The user talks to you from the Claude Basecamp dashboard. You have full access to every repository and folder they work in: you run from the home directory, so read, edit, and run commands wherever the work is. The repository map below tells you what exists and what state it is in; the dashboard's Repos tab shows the same to the user. Your job: keep every project moving — plan work, set up automation, track goals, answer questions about any repo, and coordinate across them.`
    : `You are this project's Basecamp Manager — a persistent project-management agent for ${target}.
The user talks to you from the Claude Basecamp dashboard. Your job: keep the project moving. You can plan work, set up automation, track goals, configure the repo, and answer questions about project state.`
  return `${charter}

You have full Claude Code tools (read/edit files, run commands)${isGlobal ? ' anywhere on this machine' : ' in the project directory'}. Use them for things like setting up Claude Code hooks (.claude/settings.json), CLAUDE.md, git workflows, and inspecting code.${context ? `\n\nRepository map (live, from Basecamp):\n${context}` : ''}

You ALSO control Basecamp itself through its local API (use Bash curl). Cookbook:

# Schedule a routine (recurring background Claude run in this project)
curl -s -X POST ${api}/routines -H 'Content-Type: application/json' -d '{"name":"Nightly tests","projectPath":"${projectPath}","prompt":"<what Claude should do>","schedule":{"type":"daily","time":"21:00"},"permissionMode":"acceptEdits","model":"sonnet"}'
# schedule shapes: {"type":"interval","minutes":120} | {"type":"daily","time":"09:00"} | {"type":"weekly","day":1,"time":"09:00"} (day 0=Sunday)
# List / update / delete / fire now:
curl -s ${api}/routines
curl -s -X PUT ${api}/routines/<id> -d '{"enabled":false}' -H 'Content-Type: application/json'
curl -s -X DELETE ${api}/routines/<id>
curl -s -X POST ${api}/routines/<id>/run

# Goals (project goal tracker shown on the dashboard)
curl -s -X POST ${api}/goals -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","title":"Ship auth flow","notes":"optional details"}'
curl -s "${api}/goals?project=${isGlobal ? '<url-encoded repo path>' : encodeURIComponent(target)}"
curl -s -X PUT ${api}/goals/<id> -d '{"status":"done"}' -H 'Content-Type: application/json'   # status: open | done
curl -s -X DELETE ${api}/goals/<id>

# One-off background run (long task without blocking this chat)
curl -s -X POST ${api}/runs -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","prompt":"<task>","permissionMode":"acceptEdits","model":"sonnet"}'
# routines and runs both accept "model" (any Claude alias or full id) and optional "effort": low|medium|high|xhigh|max
curl -s ${api}/runs   # check statuses

# Checks — standing conditions Basecamp continuously enforces (verifies reality, fixes failures, escalates decisions). API routes say 'intents'.
# Builtins: tests-green | deps-fresh | backlog-triaged. Custom: plain-English text.
curl -s -X POST ${api}/intents -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","builtin":"tests-green","intervalMinutes":120}'
curl -s -X POST ${api}/intents -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","text":"The README always documents every CLI flag","intervalMinutes":720}'
curl -s "${api}/intents?project=${isGlobal ? '<url-encoded repo path>' : encodeURIComponent(target)}"
curl -s -X PUT ${api}/intents/<id> -d '{"enabled":false}' -H 'Content-Type: application/json'
curl -s -X DELETE ${api}/intents/<id>
# When the user expresses a DURABLE outcome ("tests should always pass", "keep deps updated", "docs must stay current"),
# prefer creating a check over a routine — checks verify reality and self-correct; routines just run on a clock.

# Project stats / recent activity
curl -s ${api}/overview
curl -s "${api}/usage?days=7"

Memory: ${
    isGlobal
      ? `maintain ~/.claude-basecamp/MANAGER.md as your durable cross-repo memory (goals, current plans, decisions, automation you set up — short and current). When working inside a specific repo, also keep that repo's BASECAMP.md at its root. Read them when you lack context; update them whenever goals, plans, or automation change.`
      : `maintain a BASECAMP.md file at the project root. It is your durable memory and the user's window into your management of the project. Keep it short and current: ## Goals, ## Current plan, ## Decisions, ## Automation (routines you set up). Read it at the start of a conversation if you lack context; update it whenever goals, plans, or automation change. Never let it grow stale or long.`
  }

Guidelines:
- When the user asks for automation ("check tests every night", "keep the changelog updated"), create a routine with a well-written prompt, then confirm what you set up and when it will next run.
- When the user states an objective, record it as a goal; mark goals done as they complete. Keep goals as the shared source of truth of what this project is driving toward.
- Prefer background runs for heavy work; keep chat responses short and action-oriented.
- Report back concretely: what you created/changed and where it's visible in Basecamp.
- Plain text only in responses — no emojis.`
}

/**
 * Send a message to a project's manager. Spawns `claude -p` (resuming the
 * manager's persistent session when one exists) and forwards parsed events to
 * onEvent as they arrive. Persists the exchange to the messages store.
 * Returns a promise that resolves when the turn completes.
 *
 * model/effort/permissionMode are sticky per repo: an omitted field inherits
 * the repo's last-used value; an explicit value (including null for "your
 * Claude Code default") overwrites it.
 */
export function sendChatMessage(stores, { projectPath, message, port, model, permissionMode, effort, context }, onEvent, spawnFn = spawn) {
  const isGlobal = projectPath === GLOBAL_CHAT
  if (!isGlobal && (!projectPath || !existsSync(projectPath))) {
    throw new Error(`Project path does not exist: ${projectPath}`)
  }
  if (!message || !message.trim()) throw new Error('Message is required')
  if (liveChats.has(projectPath)) throw new Error('Manager is still working on the previous message')

  let manager = stores.managers.list().find((m) => m.projectPath === projectPath) || null
  const chatModel = model === undefined ? manager?.model ?? null : model
  const chatEffort = effort === undefined ? manager?.effort ?? null : effort
  const chatPermissionMode = permissionMode === undefined ? manager?.permissionMode ?? 'acceptEdits' : permissionMode
  if (!ALLOWED_PERMISSION_MODES.has(chatPermissionMode)) {
    throw new Error(`Invalid permission mode: ${chatPermissionMode}`)
  }
  if (chatModel !== null && (typeof chatModel !== 'string' || !MODEL_NAME_PATTERN.test(chatModel))) {
    throw new Error(`Invalid model: ${chatModel}`)
  }
  if (chatEffort !== null && !EFFORT_LEVELS.includes(chatEffort)) {
    throw new Error(`Invalid effort: ${chatEffort}`)
  }

  stores.messages.insert({ projectPath, role: 'user', text: message })

  // Persist the choice up front so the dashboard can preselect it next visit,
  // even if this turn dies before producing a session id.
  const prefs = { model: chatModel, effort: chatEffort, permissionMode: chatPermissionMode, updatedAt: Date.now() }
  manager = manager
    ? stores.managers.update(manager.id, prefs)
    : stores.managers.insert({ projectPath, sessionId: null, ...prefs })

  // Headless mode denies Bash without an explicit grant in every permission
  // mode short of bypass, which would cut the manager off from the Basecamp
  // API cookbook — so curl is always allowlisted.
  //
  // The manager only ever talks to Basecamp's own API via curl, never any
  // MCP tool — but it inherits every MCP server configured in the user's
  // global ~/.claude.json, each adding tool schemas and connection latency
  // to every turn. --strict-mcp-config plus an empty inline config loads
  // zero MCP servers for this session without touching that global file.
  const args = [
    '-p', message,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', chatPermissionMode,
    '--allowedTools', 'Bash(curl:*)',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
  ]
  if (chatModel) args.push('--model', chatModel)
  if (chatEffort) args.push('--effort', chatEffort)
  if (manager.sessionId) {
    args.push('--resume', manager.sessionId)
  }
  // A fresh session after a compact starts from the handoff brief the old
  // session wrote about itself — continuity without the token weight.
  let handoff = null
  if (!manager.sessionId) {
    handoff = stores.messages.list().find((m) => m.projectPath === projectPath && m.role === 'summary')
  }
  // System prompt is appended every turn: cheap, and it survives session loss.
  args.push(
    '--append-system-prompt',
    managerSystemPrompt(projectPath, port, context) +
      (handoff ? `\n\nHandoff brief from your previous (compacted) conversation:\n${handoff.text}` : '')
  )

  const child = spawnFn('claude', args, {
    cwd: chatCwd(projectPath),
    env: sanitizedEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    // npm-installed `claude` resolves to a .cmd/.ps1 shim on Windows, which
    // needs a shell to execute — see the identical note in runner.js.
    shell: process.platform === 'win32',
  })
  liveChats.set(projectPath, child)

  const timeout = setTimeout(() => child.kill('SIGTERM'), CHAT_TIMEOUT_MS)

  // The manager can keep running after the user navigates away (the client's
  // streaming fetch is only how events reach the page while it's open) — this
  // is exactly the case the notification inbox exists for.
  const notifyManagerMessage = (text) => {
    if (!text) return
    recordNotification(stores, {
      type: 'manager-message',
      projectPath: isGlobal ? null : projectPath,
      title: isGlobal ? 'Manager replied' : `Manager replied in ${lastPathSegment(projectPath)}`,
      body: text.slice(0, 300),
    })
  }

  return new Promise((resolve) => {
    let sessionId = manager.sessionId || null
    let stderrTail = ''
    const assistantParts = []

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
    rl.on('line', (line) => {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      if (event.type === 'system' && event.subtype === 'init') {
        sessionId = event.session_id
      }
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        for (const part of event.message.content) {
          if (part.type === 'text' && part.text) {
            assistantParts.push(part.text)
            onEvent({ type: 'text', text: part.text })
          }
          if (part.type === 'tool_use') {
            onEvent({ type: 'tool', name: part.name, detail: toolDetail(part) })
          }
        }
      }
      if (event.type === 'result') {
        sessionId = event.session_id || sessionId
        if (event.is_error && event.result) onEvent({ type: 'text', text: event.result })
      }
    })

    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000)
    })

    const finish = (errorText) => {
      clearTimeout(timeout)
      liveChats.delete(projectPath)
      if (sessionId) stores.managers.update(manager.id, { sessionId, updatedAt: Date.now() })
      const fullText = assistantParts.join('\n\n')
      if (fullText) {
        stores.messages.insert({ projectPath, role: 'assistant', text: fullText })
        notifyManagerMessage(fullText)
      }
      onEvent({ type: 'done', error: errorText || null })
      resolve()
    }

    child.on('error', (err) => {
      const msg =
        err.code === 'ENOENT'
          ? 'claude CLI not found on PATH — install Claude Code first'
          : err.message
      stores.messages.insert({ projectPath, role: 'assistant', text: `⚠️ ${msg}` })
      notifyManagerMessage(`⚠️ ${msg}`)
      onEvent({ type: 'text', text: `⚠️ ${msg}` })
      finish(msg)
    })

    child.on('exit', (code) => {
      if (code !== 0 && assistantParts.length === 0) {
        const msg = `Manager exited with code ${code}${stderrTail ? `: ${stderrTail.trim().slice(-300)}` : ''}`
        stores.messages.insert({ projectPath, role: 'assistant', text: `⚠️ ${msg}` })
        notifyManagerMessage(`⚠️ ${msg}`)
        onEvent({ type: 'text', text: `⚠️ ${msg}` })
        return finish(msg)
      }
      finish(null)
    })
  })
}

function toolDetail(part) {
  const input = part.input || {}
  if (part.name === 'Bash') return String(input.command || '').slice(0, 80)
  // Split on either separator: file_path is a real filesystem path and may
  // be backslash-separated on Windows.
  if (input.file_path) return String(input.file_path).split(/[\\/]/).slice(-2).join('/')
  if (input.pattern) return String(input.pattern).slice(0, 60)
  return null
}

export function chatBusy(projectPath) {
  return liveChats.has(projectPath)
}

/**
 * Visible history: everything inserted after the last clear/compact cut.
 * The cut is the id of the newest message at cut time — insertion order in
 * the store is authoritative, so same-millisecond writes can't leak through.
 */
export function chatHistory(stores, projectPath, limit = 60) {
  const manager = stores.managers.list().find((m) => m.projectPath === projectPath)
  const all = stores.messages.list().filter((m) => m.projectPath === projectPath) // newest first
  let visible = all
  if (manager?.historyAfterId) {
    const cut = all.findIndex((m) => m.id === manager.historyAfterId)
    if (cut !== -1) visible = all.slice(0, cut)
    // Cut message already trimmed off the capped store: everything is newer.
  }
  return visible.slice(0, limit).reverse()
}

const historyCut = (stores, target) =>
  stores.messages.list().find((m) => m.projectPath === target)?.id || null

/**
 * Forget the conversation: history hides behind the cut and the next
 * message starts a fresh session. Nothing is deleted from disk.
 */
export function clearChat(stores, target) {
  const manager = stores.managers.list().find((m) => m.projectPath === target)
  if (manager) {
    stores.managers.update(manager.id, { sessionId: null, historyAfterId: historyCut(stores, target) })
  }
  return { cleared: true }
}

const COMPACT_TIMEOUT_MS = 3 * 60 * 1000
const COMPACT_PROMPT =
  'Write a compact handoff brief of this entire conversation for your own future self: decisions made, current state of each piece of work, active automation, open threads, and user preferences you learned. Reply with ONLY the brief, no preamble.'

/**
 * Compact the conversation: the current session writes a handoff brief about
 * itself (read-only turn), history collapses to that brief, and the next
 * message starts a fresh session seeded with it.
 */
export function compactChat(stores, { target, port }, spawnFn = spawn) {
  const manager = stores.managers.list().find((m) => m.projectPath === target)
  if (!manager?.sessionId) return Promise.resolve(clearChat(stores, target))
  if (liveChats.has(target)) {
    return Promise.reject(new Error('Manager is still working — wait for the turn to finish'))
  }
  return new Promise((resolve, reject) => {
    const child = spawnFn(
      'claude',
      ['-p', COMPACT_PROMPT, '--output-format', 'json', '--resume', manager.sessionId, '--permission-mode', 'plan'],
      {
        cwd: chatCwd(target),
        env: sanitizedEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }
    )
    let out = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), COMPACT_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(err.code === 'ENOENT' ? 'claude CLI not found on PATH' : err.message))
    })
    child.on('exit', () => {
      clearTimeout(timer)
      let summary = ''
      try {
        summary = String(JSON.parse(out).result || '').trim()
      } catch {
        /* unparseable output — fail below rather than wipe history */
      }
      if (!summary) return reject(new Error('Compact produced no summary — history left untouched'))
      stores.managers.update(manager.id, { sessionId: null, historyAfterId: historyCut(stores, target) })
      stores.messages.insert({ projectPath: target, role: 'summary', text: summary })
      resolve({ compacted: true, summary })
    })
  })
}

