import { readFileSync, existsSync } from 'node:fs'
import { claudeJsonPath } from './paths.js'
import { listProjects as listSessionDirs } from './sessions.js'

/** Encode a real filesystem path the way Claude Code names project directories. */
export function encodeProjectPath(realPath) {
  return realPath.replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * List projects with REAL paths (from ~/.claude.json registry), merged with
 * session activity stats from the transcripts directory. Projects that only
 * exist as transcript dirs (registry pruned) fall back to the decoded path.
 */
export function listRealProjects(claudeDir) {
  const sessionDirs = listSessionDirs(claudeDir)
  const byEncoded = new Map(sessionDirs.map((p) => [p.id, p]))
  const projects = []
  const claimed = new Set()

  let registry = {}
  try {
    const raw = JSON.parse(readFileSync(claudeJsonPath(claudeDir), 'utf8'))
    registry = raw.projects || {}
  } catch {
    /* registry missing or unreadable — fall back to transcript dirs only */
  }

  for (const realPath of Object.keys(registry)) {
    const encoded = encodeProjectPath(realPath)
    const stats = byEncoded.get(encoded)
    if (stats) claimed.add(encoded)
    projects.push({
      path: realPath,
      exists: existsSync(realPath),
      id: encoded,
      sessionCount: stats?.sessionCount || 0,
      lastModified: stats?.lastModified || 0,
      isActive: stats?.isActive || false,
    })
  }

  for (const stats of sessionDirs) {
    if (claimed.has(stats.id)) continue
    projects.push({
      path: stats.path,
      exists: existsSync(stats.path),
      id: stats.id,
      sessionCount: stats.sessionCount,
      lastModified: stats.lastModified,
      isActive: stats.isActive,
    })
  }

  return projects.sort((a, b) => b.lastModified - a.lastModified)
}
