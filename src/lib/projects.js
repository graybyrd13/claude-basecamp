import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs'
import { join, dirname, resolve, isAbsolute, basename } from 'node:path'
import { claudeJsonPath } from './paths.js'
import { listProjects as listSessionDirs, listSessions } from './sessions.js'

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

/** A linked worktree's .git FILE points back into the main repo — follow it home. */
function mainRepoFromWorktreeMarker(markerPath, checkoutDir) {
  try {
    const match = readFileSync(markerPath, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m)
    if (!match) return checkoutDir
    const gitdir = isAbsolute(match[1]) ? match[1] : resolve(checkoutDir, match[1])
    // <main>/.git/worktrees/<name> → the main repo root is <main>.
    if (basename(dirname(gitdir)) === 'worktrees' && basename(dirname(dirname(gitdir))) === '.git') {
      return dirname(dirname(dirname(gitdir)))
    }
    // Anything else (e.g. a submodule) is its own repository.
    return checkoutDir
  } catch {
    return checkoutDir
  }
}

// Root resolution is stat-only but walks to the filesystem root, and the
// dashboard polls every few seconds — memoize briefly so a poll tick costs
// one Map hit per project instead of a stat per ancestor directory.
const ROOT_CACHE_TTL_MS = 30 * 1000
const rootCache = new Map()

/**
 * Resolve the git repository root that owns `startPath`, walking upward.
 * A `.git` directory marks a repo root; a `.git` FILE marks a linked worktree
 * checkout, which folds into its main repo. Paths outside any repo return null.
 * Paths are canonicalized first (symlinks resolved, on-disk casing) so the
 * same physical repo never appears under two spellings.
 */
export function repoRootFor(startPath) {
  const cached = rootCache.get(startPath)
  if (cached && Date.now() - cached.at < ROOT_CACHE_TTL_MS) return cached.root
  const root = computeRepoRoot(startPath)
  rootCache.set(startPath, { root, at: Date.now() })
  return root
}

function computeRepoRoot(startPath) {
  let current
  try {
    current = realpathSync(startPath)
  } catch {
    current = resolve(startPath)
  }
  for (;;) {
    let marker = null
    try {
      marker = statSync(join(current, '.git'))
    } catch {
      /* no .git here — keep walking up */
    }
    if (marker?.isDirectory()) return current
    if (marker?.isFile()) return mainRepoFromWorktreeMarker(join(current, '.git'), current)
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * One-time normalization at boot: records created against subdirectories or
 * worktree checkouts re-key to their repo root, so one repo reads as one
 * thread of managers, goals, chats, and checks. Idempotent; non-repo and
 * vanished paths are left untouched.
 */
export function normalizeStorePaths(stores) {
  for (const name of ['managers', 'goals', 'intents', 'routines', 'messages']) {
    const store = stores[name]
    if (!store) continue
    for (const record of store.list()) {
      if (!record.projectPath || !existsSync(record.projectPath)) continue
      const root = repoRootFor(record.projectPath)
      if (root && root !== record.projectPath) store.update(record.id, { projectPath: root })
    }
  }
  // Re-keying can leave one repo with several managers; keep the freshest.
  const keptByPath = new Map()
  for (const manager of stores.managers.list()) {
    if (!manager.projectPath) continue // meta records (e.g. lastSeen) are not managers
    const kept = keptByPath.get(manager.projectPath)
    if (!kept) {
      keptByPath.set(manager.projectPath, manager)
      continue
    }
    const age = (m) => m.updatedAt || m.createdAt || 0
    const freshest = age(manager) > age(kept) ? manager : kept
    const stale = freshest === manager ? kept : manager
    stores.managers.remove(stale.id)
    keptByPath.set(freshest.projectPath, freshest)
  }
}

/**
 * Group Claude project dirs into the git repositories that own them.
 * Worktree checkouts and subdirectory working dirs fold into their repo root;
 * paths outside any repo (chat scratch dirs, temp folders) are dropped.
 * One repo, one entry — however many places Claude was launched from.
 *
 * `extraPaths` seeds repos Basecamp manages (intents, routines, managers)
 * that may have no Claude sessions of their own yet — a repo whose checks
 * always hold never spawns a session, but it still belongs on the board.
 */
export function listRepos(claudeDir, extraPaths = []) {
  const byRoot = new Map()
  const repoFor = (root) => {
    let repo = byRoot.get(root)
    if (!repo) {
      repo = {
        path: root,
        id: encodeProjectPath(root),
        exists: true,
        sessionCount: 0,
        lastModified: 0,
        isActive: false,
        members: [],
      }
      byRoot.set(root, repo)
    }
    return repo
  }

  for (const project of listRealProjects(claudeDir)) {
    if (!project.exists) continue
    const root = repoRootFor(project.path)
    if (!root) continue
    const repo = repoFor(root)
    repo.sessionCount += project.sessionCount
    repo.lastModified = Math.max(repo.lastModified, project.lastModified)
    repo.isActive = repo.isActive || project.isActive
    repo.members.push({ id: project.id, path: project.path })
  }

  for (const path of extraPaths) {
    if (!path || !existsSync(path)) continue
    const root = repoRootFor(path)
    if (root) repoFor(root)
  }

  // The root's own project dir answers for the repo even if Claude never ran
  // at the root itself — merged session lookups start from it.
  for (const repo of byRoot.values()) {
    if (!repo.members.some((m) => m.id === repo.id)) {
      repo.members.unshift({ id: repo.id, path: repo.path })
    }
  }
  return [...byRoot.values()].sort((a, b) => b.lastModified - a.lastModified)
}

/** All sessions across a repo's member project dirs, newest first. */
export function listRepoSessions(claudeDir, repo) {
  return repo.members
    .flatMap((member) => listSessions(claudeDir, member.id))
    .sort((a, b) => b.lastModified - a.lastModified)
}
