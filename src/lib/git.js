import { execFile } from 'node:child_process'

const GIT_TIMEOUT_MS = 4000
const CACHE_TTL_MS = 10 * 1000

// repoPath -> { at, info } — git status is polled by the UI, so keep it cheap.
const cache = new Map()

function git(repoPath, args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repoPath, ...args],
      { timeout: GIT_TIMEOUT_MS, encoding: 'utf8' },
      (err, stdout) => resolve(err ? null : stdout.trim())
    )
  })
}

/**
 * Snapshot of a repo's git state: branch, dirty file count, ahead/behind
 * upstream, and last commit. Returns null for non-repos. Cached for 10s.
 */
export async function gitStatus(repoPath) {
  const cached = cache.get(repoPath)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info

  const inside = await git(repoPath, ['rev-parse', '--is-inside-work-tree'])
  let info = null
  if (inside === 'true') {
    const [branch, porcelain, counts, lastCommit] = await Promise.all([
      git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(repoPath, ['status', '--porcelain']),
      git(repoPath, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']),
      git(repoPath, ['log', '-1', '--format=%h%x00%s%x00%ct']),
    ])
    let ahead = null
    let behind = null
    if (counts) {
      const [b, a] = counts.split(/\s+/).map(Number)
      behind = b
      ahead = a
    }
    let commit = null
    if (lastCommit) {
      const [sha, subject, ts] = lastCommit.split('\0')
      commit = { sha, subject, time: Number(ts) * 1000 }
    }
    info = {
      branch: branch || null,
      dirtyFiles: porcelain === null ? null : porcelain ? porcelain.split('\n').length : 0,
      ahead,
      behind,
      commit,
    }
  }
  cache.set(repoPath, { at: Date.now(), info })
  return info
}

/** Current HEAD sha, or null. Used to attribute commits made by a run. */
export function headSha(repoPath) {
  return git(repoPath, ['rev-parse', 'HEAD'])
}

/** Commits between two shas, newest first: [{sha, subject}]. */
export async function commitsBetween(repoPath, fromSha, toSha) {
  if (!fromSha || !toSha || fromSha === toSha) return []
  const out = await git(repoPath, ['log', '--format=%h%x00%s', `${fromSha}..${toSha}`])
  if (!out) return []
  return out.split('\n').map((line) => {
    const [sha, subject] = line.split('\0')
    return { sha, subject }
  })
}
