import { existsSync } from 'node:fs'
import { listSessions, summarizeSession } from './sessions.js'
import { listRealProjects } from './projects.js'

const WINDOW_DAYS = 7
const IDLE_THRESHOLD_MS = 30 * 60 * 1000
const MAX_CANDIDATES = 6
const MAX_SESSIONS_SCANNED = 60

/**
 * Classify how a session ended. A session is rescuable when its transcript
 * stops mid-flight: the assistant was mid-tool-call, a tool result arrived
 * with no follow-up, or the user asked something and never got an answer.
 */
export function classifyEnd(summary) {
  if (!summary || summary.userMessages === 0) return null
  if (summary.lastEvent === 'assistant-tool') {
    return {
      reason: 'crashed mid-action',
      detail: summary.lastToolName ? `was running ${summary.lastToolName}` : 'was running a tool',
    }
  }
  if (summary.lastEvent === 'tool-result') {
    return { reason: 'stopped mid-task', detail: 'ended while processing a tool result' }
  }
  if (summary.lastEvent === 'user') {
    if (summary.lastUserText && summary.lastUserText.startsWith('[Request interrupted')) {
      return { reason: 'interrupted', detail: 'stopped before the work was finished' }
    }
    return {
      reason: 'unanswered request',
      detail: summary.lastUserText ? `last message: "${summary.lastUserText.slice(0, 80)}"` : 'ended on a user message',
    }
  }
  return null
}

/**
 * Scan recent sessions across all repos for unfinished work. Per-session
 * parses are mtime-cached in sessions.js, so repeat scans are cheap.
 */
export async function findRescueCandidates(claudeDir, stores) {
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const now = Date.now()

  // Sessions already rescued (or currently being rescued) shouldn't reappear.
  const rescuedSessionIds = new Set(
    stores.runs.list().filter((r) => r.rescuedSessionId).map((r) => r.rescuedSessionId)
  )

  const recent = []
  for (const project of listRealProjects(claudeDir)) {
    if (!project.exists || project.lastModified < cutoff) continue
    for (const session of listSessions(claudeDir, project.id)) {
      if (session.lastModified < cutoff) continue
      if (now - session.lastModified < IDLE_THRESHOLD_MS) continue // still live
      if (rescuedSessionIds.has(session.id)) continue
      recent.push({ session, project })
    }
  }
  recent.sort((a, b) => b.session.lastModified - a.session.lastModified)

  const candidates = []
  for (const { session, project } of recent.slice(0, MAX_SESSIONS_SCANNED)) {
    const summary = await summarizeSession(claudeDir, project.id, session.id)
    const ending = classifyEnd(summary)
    if (!ending) continue
    candidates.push({
      sessionId: session.id,
      projectPath: project.path,
      title: summary.title,
      lastActivity: session.lastModified,
      userMessages: summary.userMessages,
      ...ending,
    })
    if (candidates.length >= MAX_CANDIDATES) break
  }
  return candidates
}

/** The continuation instruction for a resumed dead session. */
export function rescuePrompt() {
  return (
    'This session ended unexpectedly before the work was finished. ' +
    'Review the conversation above to determine exactly what was in progress and what remains undone. ' +
    'Then finish the job: complete the remaining work, run any relevant tests, and commit the results with a clear message. ' +
    'If the work was already complete, verify it and say so. Finish with a short summary of what you did.'
  )
}

export function validateRescueTarget(claudeDir, projectPath) {
  if (!projectPath || !existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`)
  }
}
