import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { streamJsonl } from './jsonl.js'
import { listSessions } from './sessions.js'
import { listRealProjects } from './projects.js'
import { lastPathSegment } from './paths.js'

const QUOTE_MAX = 160
const SCAN_WINDOW_DAYS = 60
const MAX_SESSIONS_SCANNED = 150

// Commands too common and too benign to ever block — matching these would
// cry wolf, and a guardian that false-positives gets uninstalled.
const BENIGN_PREFIXES = [
  'git status', 'git diff', 'git log', 'git branch', 'git show',
  'ls', 'cat', 'pwd', 'echo', 'grep', 'find', 'head', 'tail', 'which',
  'npm test', 'npm run', 'node --test', 'curl -s',
]

// Navigation and pure-read commands: never meaningful as antibodies by themselves.
const BENIGN_FIRST_TOKENS = new Set(['cd', 'ls', 'cat', 'echo', 'pwd', 'grep', 'find', 'head', 'tail', 'which', 'sleep', 'true'])

/** Normalize a Bash command to a matchable prefix: its first two meaningful tokens. */
export function commandPrefix(command) {
  const tokens = String(command || '').trim().split(/\s+/)
  if (tokens.length === 0 || !tokens[0]) return null
  if (BENIGN_FIRST_TOKENS.has(tokens[0])) return null
  const prefix = tokens.slice(0, 2).join(' ')
  return prefix.length > 1 ? prefix : null
}

function isBenign(prefix) {
  return BENIGN_PREFIXES.some((b) => prefix === b || prefix.startsWith(b + ' ') || b.startsWith(prefix + ' '))
}

const CORRECTION_RE = /^(no[,.! ]|nope|stop[,.! ]|stop$|wait[,.! ]|wait$|don'?t |do not |wrong[,.! ]|not that|never |undo |revert )/i
// System-generated user messages that must never read as human pushback.
const SYNTHETIC_RE = /^(stop hook|.*hook feedback|\[?tool_result|<)/i
const EMPHASIS_RE = /\b(i said|i told you|again\?|why did you|you weren'?t supposed)\b/i

function patternFromTool(tool) {
  if (!tool) return null
  if (tool.name === 'Bash') {
    const prefix = commandPrefix(tool.input?.command)
    if (!prefix || isBenign(prefix)) return null
    return { tool: 'Bash', match: prefix }
  }
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool.name) && tool.input?.file_path) {
    return { tool: tool.name, match: lastPathSegment(tool.input.file_path) }
  }
  return null
}

const patternKey = (p) => `${p.tool}::${p.match.toLowerCase()}`

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.find((p) => p?.type === 'text')?.text || null
  return null
}

/**
 * Mine one transcript for antibodies: moments where the human pushed back on
 * a concrete action — interruptions mid-tool-call, and corrections right
 * after a tool ran. Pure JS, zero tokens.
 */
export async function mineSession(filePath, context) {
  const found = []
  let lastTools = [] // tool_use parts from the most recent assistant message
  await streamJsonl(filePath, (entry) => {
    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      const tools = entry.message.content
        .filter((p) => p?.type === 'tool_use')
        .map((p) => ({ name: p.name, input: p.input || {} }))
      if (tools.length) lastTools = tools
      return
    }
    if (entry.type !== 'user' || entry.isSidechain || !entry.message) return
    const text = extractText(entry.message.content)
    if (!text || text.startsWith('<')) return

    if (SYNTHETIC_RE.test(text.trim())) return
    const interrupted = text.startsWith('[Request interrupted')
    const correction = CORRECTION_RE.test(text.trim()) || EMPHASIS_RE.test(text)
    if (!interrupted && !correction) return

    for (const tool of lastTools.slice(-2)) {
      const pattern = patternFromTool(tool)
      if (!pattern) continue
      found.push({
        kind: interrupted ? 'interrupted' : 'correction',
        pattern,
        evidence: {
          ...context,
          quote: interrupted ? '(interrupted mid-action)' : text.slice(0, QUOTE_MAX),
          action:
            tool.name === 'Bash'
              ? String(tool.input.command || '').slice(0, QUOTE_MAX)
              : `${tool.name} ${lastPathSegment(tool.input.file_path || '')}`,
        },
      })
    }
    lastTools = []
  })
  return found
}

/**
 * Scan recent history across all repos and merge findings into the antibody
 * store. Also folds in permission denials recorded on past runs. Incremental:
 * already-scanned sessions are skipped by id.
 */
export async function mineAntibodies(claudeDir, stores) {
  const state = stores.reflex.list().find((r) => r.key === 'scan') ||
    stores.reflex.insert({ key: 'scan', scannedSessionIds: [], lastScan: null })
  const scanned = new Set(state.scannedSessionIds || [])
  const cutoff = Date.now() - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000

  const jobs = []
  for (const project of listRealProjects(claudeDir)) {
    if (project.lastModified < cutoff) continue
    for (const session of listSessions(claudeDir, project.id)) {
      if (session.lastModified < cutoff || scanned.has(session.id)) continue
      jobs.push({ project, session })
    }
  }

  let newSignals = 0
  for (const { project, session } of jobs.slice(0, MAX_SESSIONS_SCANNED)) {
    const filePath = join(claudeDir, 'projects', project.id, `${session.id}.jsonl`)
    if (!existsSync(filePath)) continue
    const signals = await mineSession(filePath, {
      projectPath: project.path,
      sessionId: session.id,
      date: session.lastModified,
    })
    for (const signal of signals) {
      absorb(stores, signal)
      newSignals++
    }
    scanned.add(session.id)
  }

  // Permission denials from past runs are pre-labeled antibodies.
  for (const run of stores.runs.list()) {
    for (const denial of run.permissionDenials || []) {
      const pattern = patternFromTool({ name: denial.tool_name, input: denial.tool_input })
      if (!pattern) continue
      absorb(stores, {
        kind: 'denied',
        pattern,
        evidence: {
          projectPath: run.projectPath,
          sessionId: run.sessionId,
          date: run.startedAt,
          quote: '(permission denied on a background run)',
          action: denial.tool_name === 'Bash' ? String(denial.tool_input?.command || '').slice(0, QUOTE_MAX) : pattern.match,
        },
      })
    }
  }

  stores.reflex.update(state.id, {
    scannedSessionIds: [...scanned].slice(-2000),
    lastScan: Date.now(),
  })
  return { newSignals, antibodies: stores.antibodies.list().length }
}

/** Merge a signal into the antibody store, bumping counts on repeat exposure. */
function absorb(stores, signal) {
  const key = patternKey(signal.pattern)
  const existing = stores.antibodies.list().find((a) => a.key === key)
  if (existing) {
    stores.antibodies.update(existing.id, {
      count: existing.count + 1,
      kinds: [...new Set([...existing.kinds, signal.kind])],
      evidence: [...existing.evidence, signal.evidence].slice(-5),
      lastSeen: Math.max(existing.lastSeen || 0, signal.evidence.date || 0),
    })
  } else {
    stores.antibodies.insert({
      key,
      pattern: signal.pattern,
      kinds: [signal.kind],
      count: 1,
      evidence: [signal.evidence],
      lastSeen: signal.evidence.date || Date.now(),
      muted: false,
    })
  }
}

/**
 * The reflex arc: given a live tool call, answer allow/deny in-process.
 * Deny only on repeated exposure (count >= 2) — one-off events log but never
 * block, so the guardian never cries wolf.
 */
export function reflexVerdict(stores, { toolName, toolInput }) {
  const pattern = patternFromTool({ name: toolName, input: toolInput || {} })
  if (!pattern) return { decision: 'allow' }
  const key = patternKey(pattern)
  const antibody = stores.antibodies.list().find((a) => a.key === key && !a.muted)
  if (!antibody || antibody.count < 2) return { decision: 'allow', matched: antibody?.id }

  const last = antibody.evidence[antibody.evidence.length - 1]
  const when = last?.date ? new Date(last.date).toISOString().slice(0, 10) : 'previously'
  const where = last?.projectPath ? lastPathSegment(last.projectPath) : 'a repo'
  const why = antibody.kinds.includes('interrupted')
    ? 'the user interrupted this exact kind of action'
    : antibody.kinds.includes('correction')
      ? `the user pushed back: "${last?.quote || 'correction'}"`
      : 'this was previously denied'
  return {
    decision: 'deny',
    antibodyId: antibody.id,
    reason:
      `Basecamp reflex: "${pattern.match}" has gone wrong ${antibody.count} times before ` +
      `(last: ${when} in ${where} — ${why}). ` +
      `If this action is genuinely needed here, explain why to the user and ask them to proceed manually or mute this reflex in Basecamp.`,
  }
}

/**
 * The relationship diagnosis: what Claude needs more of from the user, and
 * what the user should watch in Claude — derived from antibody categories.
 */
export function immuneStats(stores) {
  const antibodies = stores.antibodies.list()
  const state = stores.reflex.list().find((r) => r.key === 'scan')
  const counters = stores.reflex.list().find((r) => r.key === 'counters') || { checks: 0, blocks: 0 }

  const byRepo = {}
  const byTool = {}
  let corrections = 0
  let interruptions = 0
  let denials = 0
  for (const a of antibodies) {
    byTool[a.pattern.tool] = (byTool[a.pattern.tool] || 0) + a.count
    for (const e of a.evidence) {
      if (e.projectPath) {
        const repo = lastPathSegment(e.projectPath)
        byRepo[repo] = (byRepo[repo] || 0) + 1
      }
    }
    if (a.kinds.includes('correction')) corrections += a.count
    if (a.kinds.includes('interrupted')) interruptions += a.count
    if (a.kinds.includes('denied')) denials += a.count
  }

  const topRepos = Object.entries(byRepo).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const claudeNeeds = []
  const userNeeds = []

  if (corrections >= 3) {
    claudeNeeds.push(`Written conventions: ${corrections} corrections were about things a CLAUDE.md rule could state once${topRepos[0] ? ` — start with ${topRepos[0][0]}` : ''}.`)
  }
  if (interruptions >= 3) {
    claudeNeeds.push(`Smaller, clearer task scopes: ${interruptions} interruptions suggest Claude regularly runs past what you wanted. State the stopping point in the ask.`)
  }
  if (denials >= 3) {
    claudeNeeds.push(`Permission clarity: ${denials} background-run denials — pre-approve the safe commands these runs actually need (allowlists), or scope them out.`)
  }
  if (antibodies.length === 0) {
    claudeNeeds.push('Nothing yet — scan more history, or your sessions are unusually smooth.')
  }

  if (interruptions > corrections * 2 && interruptions >= 4) {
    userNeeds.push('You interrupt more than you correct — consider letting runs finish and reviewing diffs; interrupted work is the top source of dead sessions.')
  }
  if (topRepos.length && topRepos[0][1] >= 4) {
    userNeeds.push(`${topRepos[0][0]} produces the most friction — it has the weakest guardrails (missing tests or conventions make Claude guess).`)
  }
  const bashShare = (byTool.Bash || 0) / Math.max(antibodies.reduce((s, a) => s + a.count, 0), 1)
  if (bashShare > 0.7 && antibodies.length >= 3) {
    userNeeds.push('Most friction is shell commands, not edits — Claude\'s code changes are landing; supervise commands, trust the diffs.')
  }
  if (userNeeds.length === 0 && antibodies.length > 0) {
    userNeeds.push('No strong pattern yet — the immune memory sharpens as more history is scanned.')
  }

  return {
    antibodies: antibodies.length,
    exposures: antibodies.reduce((s, a) => s + a.count, 0),
    corrections,
    interruptions,
    denials,
    checks: counters.checks || 0,
    blocks: counters.blocks || 0,
    lastScan: state?.lastScan || null,
    byTool,
    topRepos,
    claudeNeeds,
    userNeeds,
  }
}

export function bumpCounters(stores, { blocked }) {
  const counters = stores.reflex.list().find((r) => r.key === 'counters')
  if (counters) {
    stores.reflex.update(counters.id, {
      checks: (counters.checks || 0) + 1,
      blocks: (counters.blocks || 0) + (blocked ? 1 : 0),
    })
  } else {
    stores.reflex.insert({ key: 'counters', checks: 1, blocks: blocked ? 1 : 0 })
  }
}
