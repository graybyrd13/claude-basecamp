import { execFile } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Clean rooms: disposable git worktrees for autonomous runs.
 *
 * A run that works in a clean room never touches the user's checkout — it
 * gets its own worktree on its own branch, and what comes back is a set of
 * commits to review. Apply merges them into the repo (fast-forward when
 * possible, aborting cleanly on conflict); discard deletes branch and
 * worktree without a trace.
 */

const GIT_TIMEOUT_MS = 15 * 1000

function git(repoPath, args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repoPath, ...args],
      { timeout: GIT_TIMEOUT_MS, encoding: 'utf8' },
      (err, stdout, stderr) =>
        resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || err?.message || '').trim() })
    )
  })
}

export const worktreesDir = (stores) => join(stores.home, 'worktrees')

export const branchNameFor = (runId) => `basecamp/run-${String(runId).slice(0, 8)}`

/** Create a clean room for a run: a worktree on a fresh branch at HEAD. */
export async function createCleanRoom(stores, runId, repoPath) {
  const path = join(worktreesDir(stores), String(runId).slice(0, 8))
  const branch = branchNameFor(runId)
  const base = await git(repoPath, ['rev-parse', 'HEAD'])
  if (!base.ok) throw new Error(`Not a git repository with commits: ${repoPath}`)
  const added = await git(repoPath, ['worktree', 'add', '-b', branch, path, 'HEAD'])
  if (!added.ok) throw new Error(`Could not create clean room: ${added.err}`)
  return { path, branch, baseSha: base.out, state: 'open' }
}

/** What did the clean room produce? Commits and a human diffstat vs its base. */
export async function cleanRoomDiff(repoPath, cleanRoom) {
  const { baseSha, branch } = cleanRoom
  const log = await git(repoPath, ['log', '--format=%h%x00%s', `${baseSha}..${branch}`])
  const commits = log.ok && log.out
    ? log.out.split('\n').map((line) => {
        const [sha, subject] = line.split('\0')
        return { sha, subject }
      })
    : []
  const stat = await git(repoPath, ['diff', '--shortstat', `${baseSha}..${branch}`])
  return { commits, stat: stat.ok ? stat.out : '' }
}

/** Full patch for review, capped. Served on demand — never stored. */
export async function cleanRoomPatch(repoPath, cleanRoom, maxChars = 200_000) {
  const diff = await git(repoPath, ['diff', `${cleanRoom.baseSha}..${cleanRoom.branch}`])
  if (!diff.ok) return ''
  return diff.out.length > maxChars
    ? diff.out.slice(0, maxChars) + '\n\n[patch truncated]'
    : diff.out
}

async function removeWorktree(stores, repoPath, cleanRoom) {
  const removed = await git(repoPath, ['worktree', 'remove', '--force', cleanRoom.path])
  if (!removed.ok && existsSync(cleanRoom.path)) {
    // Locked on Windows or half-created: delete the directory, let git forget it.
    try {
      rmSync(cleanRoom.path, { recursive: true, force: true })
    } catch {
      /* the boot sweep will retry */
    }
    await git(repoPath, ['worktree', 'prune'])
  }
}

/**
 * Merge a clean room's commits into the repo. Fast-forward when the repo
 * hasn't moved; a real merge when it has; a clean abort on conflict — the
 * user's checkout is never left mid-merge.
 */
export async function applyCleanRoom(stores, run) {
  const cleanRoom = run.cleanRoom
  if (!cleanRoom || cleanRoom.state !== 'open') throw new Error('No open clean room on this run')

  let merged = await git(run.projectPath, ['merge', '--ff-only', cleanRoom.branch])
  if (!merged.ok) {
    merged = await git(run.projectPath, ['merge', '--no-edit', cleanRoom.branch])
    if (!merged.ok) {
      await git(run.projectPath, ['merge', '--abort'])
      throw new Error(`Merge did not apply cleanly — resolve by hand or discard. ${merged.err}`.trim())
    }
  }
  await removeWorktree(stores, run.projectPath, cleanRoom)
  await git(run.projectPath, ['branch', '-D', cleanRoom.branch])
  return stores.runs.update(run.id, { cleanRoom: { ...cleanRoom, state: 'applied' } })
}

/** Throw the clean room away: worktree and branch gone, repo untouched. */
export async function discardCleanRoom(stores, run) {
  const cleanRoom = run.cleanRoom
  if (!cleanRoom || cleanRoom.state !== 'open') throw new Error('No open clean room on this run')
  await removeWorktree(stores, run.projectPath, cleanRoom)
  await git(run.projectPath, ['branch', '-D', cleanRoom.branch])
  return stores.runs.update(run.id, { cleanRoom: { ...cleanRoom, state: 'discarded' } })
}

const SWEEP_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Boot sweep: clean rooms whose runs finished long ago (or vanished from the
 * capped runs list) are discarded so worktrees never accumulate forever.
 */
export async function sweepCleanRooms(stores, now = Date.now()) {
  for (const run of stores.runs.list()) {
    const room = run.cleanRoom
    if (!room || room.state !== 'open') continue
    if (run.status === 'running' || run.status === 'awaiting-approval') continue
    if (now - (run.endedAt || run.startedAt || 0) < SWEEP_AGE_MS) continue
    try {
      await discardCleanRoom(stores, run)
    } catch {
      /* repo may be gone; nothing to clean */
    }
  }
}
