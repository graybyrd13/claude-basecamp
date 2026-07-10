import { listProjects, listSessions, summarizeSession } from './sessions.js'

const DEFAULT_WINDOW_DAYS = 30
const MAX_SESSIONS_PER_SCAN = 200

/**
 * Aggregate token usage across recent sessions.
 * Scans sessions modified within the window, newest first, capped for responsiveness.
 * Per-session parses are mtime-cached, so repeat calls are cheap.
 */
export async function usageReport(claudeDir, { windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const candidates = []
  for (const project of listProjects(claudeDir)) {
    if (project.lastModified < cutoff) continue
    for (const session of listSessions(claudeDir, project.id)) {
      if (session.lastModified >= cutoff) candidates.push(session)
    }
  }
  candidates.sort((a, b) => b.lastModified - a.lastModified)
  const scanned = candidates.slice(0, MAX_SESSIONS_PER_SCAN)

  const totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  const byModel = {}
  const byDay = {}
  const sessions = []

  for (const candidate of scanned) {
    const summary = await summarizeSession(claudeDir, candidate.projectId, candidate.id)
    if (!summary) continue
    totals.input += summary.tokens.input
    totals.output += summary.tokens.output
    totals.cacheRead += summary.tokens.cacheRead
    totals.cacheCreation += summary.tokens.cacheCreation

    for (const model of Object.keys(summary.models)) {
      byModel[model] = (byModel[model] || 0) + summary.models[model]
    }
    const day = new Date(candidate.lastModified).toISOString().slice(0, 10)
    if (!byDay[day]) byDay[day] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
    byDay[day].input += summary.tokens.input
    byDay[day].output += summary.tokens.output
    byDay[day].cacheRead += summary.tokens.cacheRead
    byDay[day].cacheCreation += summary.tokens.cacheCreation

    sessions.push({
      id: summary.id,
      projectId: summary.projectId,
      title: summary.title,
      lastModified: summary.lastModified,
      tokens: summary.tokens,
      toolCalls: summary.toolCalls,
    })
  }

  // Sessions with heavy context re-reads are the best graphify candidates:
  // high cache-read volume means the same context is being re-sent repeatedly.
  const graphifyCandidates = [...sessions]
    .sort((a, b) => b.tokens.cacheRead - a.tokens.cacheRead)
    .slice(0, 10)
    .filter((s) => s.tokens.cacheRead > 1_000_000)

  return {
    windowDays,
    scannedSessions: scanned.length,
    totalCandidates: candidates.length,
    truncated: candidates.length > scanned.length,
    totals,
    byModel,
    byDay,
    topSessions: sessions.sort((a, b) => b.tokens.output - a.tokens.output).slice(0, 15),
    graphifyCandidates,
  }
}

const MODEL_SCAN_WINDOW_DAYS = 90

/** "claude-opus-4-8" / "claude-haiku-4-5-20251001" → "Opus 4.8" / "Haiku 4.5" */
export function modelDisplayName(id) {
  const parts = String(id).replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-')
  const words = []
  let digits = []
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      digits.push(part)
      continue
    }
    if (digits.length) {
      words.push(digits.join('.'))
      digits = []
    }
    words.push(part.charAt(0).toUpperCase() + part.slice(1))
  }
  if (digits.length) words.push(digits.join('.'))
  return words.join(' ')
}

/**
 * Models actually used in recent sessions on this machine, most-used first.
 * Feeds the dashboard's model pickers — real ids, not a hardcoded alias list.
 */
export async function listRecentModels(claudeDir) {
  const report = await usageReport(claudeDir, { windowDays: MODEL_SCAN_WINDOW_DAYS })
  return Object.entries(report.byModel)
    .filter(([id]) => id.startsWith('claude-'))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ id, label: modelDisplayName(id) }))
}
