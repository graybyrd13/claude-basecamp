import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { sanitizedEnv } from './env.js'

const CHAT_TIMEOUT_MS = 10 * 60 * 1000

// One live manager conversation per project at a time.
const liveChats = new Map()

/**
 * The manager's charter: it runs inside the project directory with normal
 * Claude Code tools, plus a cookbook for Basecamp's own local API so it can
 * schedule routines, track goals, and launch background runs on request.
 */
export function managerSystemPrompt(projectPath, port) {
  const api = `http://127.0.0.1:${port}/api`
  return `You are this project's Basecamp Manager — a persistent project-management agent for ${projectPath}.
The user talks to you from the Claude Basecamp dashboard. Your job: keep the project moving. You can plan work, set up automation, track goals, configure the repo, and answer questions about project state.

You have full Claude Code tools (read/edit files, run commands) in the project directory. Use them for things like setting up Claude Code hooks (.claude/settings.json), CLAUDE.md, git workflows, and inspecting code.

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
curl -s "${api}/goals?project=${encodeURIComponent(projectPath)}"
curl -s -X PUT ${api}/goals/<id> -d '{"status":"done"}' -H 'Content-Type: application/json'   # status: open | done
curl -s -X DELETE ${api}/goals/<id>

# One-off background run (long task without blocking this chat)
curl -s -X POST ${api}/runs -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","prompt":"<task>","permissionMode":"acceptEdits","model":"sonnet"}'
curl -s ${api}/runs   # check statuses

# Checks — standing conditions Basecamp continuously enforces (verifies reality, fixes failures, escalates decisions). API routes say 'intents'.
# Builtins: tests-green | deps-fresh | backlog-triaged. Custom: plain-English text.
curl -s -X POST ${api}/intents -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","builtin":"tests-green","intervalMinutes":120}'
curl -s -X POST ${api}/intents -H 'Content-Type: application/json' -d '{"projectPath":"${projectPath}","text":"The README always documents every CLI flag","intervalMinutes":720}'
curl -s "${api}/intents?project=${encodeURIComponent(projectPath)}"
curl -s -X PUT ${api}/intents/<id> -d '{"enabled":false}' -H 'Content-Type: application/json'
curl -s -X DELETE ${api}/intents/<id>
# When the user expresses a DURABLE outcome ("tests should always pass", "keep deps updated", "docs must stay current"),
# prefer creating a check over a routine — checks verify reality and self-correct; routines just run on a clock.

# Project stats / recent activity
curl -s ${api}/overview
curl -s "${api}/usage?days=7"

Memory: maintain a BASECAMP.md file at the project root. It is your durable memory and the user's window into your management of the project. Keep it short and current: ## Goals, ## Current plan, ## Decisions, ## Automation (routines you set up). Read it at the start of a conversation if you lack context; update it whenever goals, plans, or automation change. Never let it grow stale or long.

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
 */
export function sendChatMessage(stores, { projectPath, message, port }, onEvent) {
  if (!projectPath || !existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`)
  }
  if (!message || !message.trim()) throw new Error('Message is required')
  if (liveChats.has(projectPath)) throw new Error('Manager is still working on the previous message')

  const manager = stores.managers.list().find((m) => m.projectPath === projectPath) || null
  stores.messages.insert({ projectPath, role: 'user', text: message })

  // acceptEdits alone denies Bash in headless mode, which would cut the manager
  // off from the Basecamp API cookbook — so curl is explicitly allowlisted.
  const args = [
    '-p', message,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash(curl:*)',
  ]
  if (manager?.sessionId) {
    args.push('--resume', manager.sessionId)
  }
  // System prompt is appended every turn: cheap, and it survives session loss.
  args.push('--append-system-prompt', managerSystemPrompt(projectPath, port))

  const child = spawn('claude', args, {
    cwd: projectPath,
    env: sanitizedEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    // npm-installed `claude` resolves to a .cmd/.ps1 shim on Windows, which
    // needs a shell to execute — see the identical note in runner.js.
    shell: process.platform === 'win32',
  })
  liveChats.set(projectPath, child)

  const timeout = setTimeout(() => child.kill('SIGTERM'), CHAT_TIMEOUT_MS)

  return new Promise((resolve) => {
    let sessionId = manager?.sessionId || null
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
      if (sessionId) {
        if (manager) stores.managers.update(manager.id, { sessionId, updatedAt: Date.now() })
        else stores.managers.insert({ projectPath, sessionId, updatedAt: Date.now() })
      }
      const fullText = assistantParts.join('\n\n')
      if (fullText) {
        stores.messages.insert({ projectPath, role: 'assistant', text: fullText })
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
      onEvent({ type: 'text', text: `⚠️ ${msg}` })
      finish(msg)
    })

    child.on('exit', (code) => {
      if (code !== 0 && assistantParts.length === 0) {
        const msg = `Manager exited with code ${code}${stderrTail ? `: ${stderrTail.trim().slice(-300)}` : ''}`
        stores.messages.insert({ projectPath, role: 'assistant', text: `⚠️ ${msg}` })
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

export function chatHistory(stores, projectPath, limit = 60) {
  return stores.messages
    .list()
    .filter((m) => m.projectPath === projectPath)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
}

