import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { streamJsonl } from './jsonl.js'
import { decodeProjectDirName } from './paths.js'

const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000
const TITLE_MAX_LENGTH = 120

// Parsed-session cache keyed by file path; invalidated when mtime changes.
const summaryCache = new Map()

/** List all projects with session counts and last-activity, using only fs stats (fast). */
export function listProjects(claudeDir) {
  const projectsDir = join(claudeDir, 'projects')
  if (!existsSync(projectsDir)) return []
  const projects = []
  for (const name of readdirSync(projectsDir)) {
    const dir = join(projectsDir, name)
    let entries
    try {
      entries = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    if (entries.length === 0) continue
    let lastModified = 0
    let totalBytes = 0
    for (const file of entries) {
      try {
        const stat = statSync(join(dir, file))
        lastModified = Math.max(lastModified, stat.mtimeMs)
        totalBytes += stat.size
      } catch {
        /* file removed mid-scan */
      }
    }
    projects.push({
      id: name,
      path: decodeProjectDirName(name),
      sessionCount: entries.length,
      lastModified,
      totalBytes,
      isActive: Date.now() - lastModified < ACTIVE_THRESHOLD_MS,
    })
  }
  return projects.sort((a, b) => b.lastModified - a.lastModified)
}

/** List sessions in a project using only fs stats (fast). */
export function listSessions(claudeDir, projectId) {
  const dir = join(claudeDir, 'projects', projectId)
  if (!existsSync(dir)) return []
  const sessions = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.jsonl')) continue
    try {
      const stat = statSync(join(dir, file))
      sessions.push({
        id: basename(file, '.jsonl'),
        projectId,
        bytes: stat.size,
        lastModified: stat.mtimeMs,
        created: stat.birthtimeMs || stat.ctimeMs,
        isActive: Date.now() - stat.mtimeMs < ACTIVE_THRESHOLD_MS,
      })
    } catch {
      /* file removed mid-scan */
    }
  }
  return sessions.sort((a, b) => b.lastModified - a.lastModified)
}

function emptySummary() {
  return {
    title: null,
    firstTimestamp: null,
    lastTimestamp: null,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    models: {},
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    subagents: 0,
    slashCommands: [],
    // How the transcript ends — the signal Session Rescue classifies on.
    lastEvent: null, // 'user' | 'tool-result' | 'assistant-text' | 'assistant-tool'
    lastToolName: null,
    lastUserText: null,
  }
}

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textPart = content.find((p) => p && p.type === 'text' && typeof p.text === 'string')
    return textPart ? textPart.text : null
  }
  return null
}

function applyEntry(summary, entry) {
  if (entry.timestamp) {
    if (!summary.firstTimestamp) summary.firstTimestamp = entry.timestamp
    summary.lastTimestamp = entry.timestamp
  }
  if (entry.type === 'summary' && entry.summary && !summary.title) {
    summary.title = entry.summary
  }
  if (entry.type === 'user' && entry.message && !entry.isSidechain) {
    summary.userMessages++
    if (!summary.title) {
      const text = extractText(entry.message.content)
      if (text && !text.startsWith('<')) {
        summary.title = text.slice(0, TITLE_MAX_LENGTH)
      }
    }
    const text = extractText(entry.message?.content)
    if (text && text.startsWith('<command-name>')) {
      const match = text.match(/<command-name>([^<]+)<\/command-name>/)
      if (match) summary.slashCommands.push(match[1])
    }
    const isToolResult =
      Array.isArray(entry.message.content) &&
      entry.message.content.some((p) => p && p.type === 'tool_result')
    if (isToolResult) {
      summary.lastEvent = 'tool-result'
    } else if (text && !text.startsWith('<')) {
      summary.lastEvent = 'user'
      summary.lastUserText = text.slice(0, 300)
    }
  }
  if (entry.type === 'assistant' && entry.message) {
    summary.assistantMessages++
    const model = entry.message.model
    if (model) summary.models[model] = (summary.models[model] || 0) + 1
    const usage = entry.message.usage
    if (usage) {
      summary.tokens.input += usage.input_tokens || 0
      summary.tokens.output += usage.output_tokens || 0
      summary.tokens.cacheRead += usage.cache_read_input_tokens || 0
      summary.tokens.cacheCreation += usage.cache_creation_input_tokens || 0
    }
    if (Array.isArray(entry.message.content)) {
      let sawToolUse = false
      for (const part of entry.message.content) {
        if (part && part.type === 'tool_use') {
          summary.toolCalls++
          sawToolUse = true
          summary.lastToolName = part.name
          if (part.name === 'Task' || part.name === 'Agent') summary.subagents++
        }
      }
      summary.lastEvent = sawToolUse ? 'assistant-tool' : 'assistant-text'
    }
  }
}

/** Parse a session transcript into a summary. Cached by file mtime. */
export async function summarizeSession(claudeDir, projectId, sessionId) {
  const filePath = join(claudeDir, 'projects', projectId, `${sessionId}.jsonl`)
  if (!existsSync(filePath)) return null
  const stat = statSync(filePath)
  const cached = summaryCache.get(filePath)
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.summary

  const summary = emptySummary()
  await streamJsonl(filePath, (entry) => applyEntry(summary, entry))
  summary.id = sessionId
  summary.projectId = projectId
  summary.bytes = stat.size
  summary.lastModified = stat.mtimeMs
  summary.isActive = Date.now() - stat.mtimeMs < ACTIVE_THRESHOLD_MS

  summaryCache.set(filePath, { mtimeMs: stat.mtimeMs, summary })
  return summary
}

export const _internal = { applyEntry, emptySummary }
