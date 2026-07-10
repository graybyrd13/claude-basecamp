import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { repoRootFor, listRepos, listRepoSessions, encodeProjectPath, normalizeStorePaths } from '../src/lib/projects.js'
import { Store } from '../src/lib/store.js'
import { startServer } from '../src/server.js'

/**
 * Build a little world on disk:
 *   <world>/repo              — a real repo root (.git directory)
 *   <world>/repo/packages/web — a working subdir inside that repo
 *   <world>/repo-wt           — a linked worktree checkout (.git FILE)
 *   <world>/scratch           — a plain directory, no repo anywhere above it
 * plus a fake Claude dir whose projects/ mirrors sessions run in each place.
 */
function buildWorld(t) {
  // realpath so expectations match repoRootFor's canonicalized output
  // (macOS tmpdir is itself a symlink: /var/folders -> /private/var/folders).
  const world = realpathSync(mkdtempSync(join(tmpdir(), 'basecamp-repos-test-')))
  t.after(() => rmSync(world, { recursive: true, force: true }))

  const repo = join(world, 'repo')
  const subdir = join(repo, 'packages', 'web')
  const worktree = join(world, 'repo-wt')
  const scratch = join(world, 'scratch')

  mkdirSync(join(repo, '.git', 'worktrees', 'wt'), { recursive: true })
  mkdirSync(subdir, { recursive: true })
  mkdirSync(worktree, { recursive: true })
  mkdirSync(scratch, { recursive: true })
  writeFileSync(join(worktree, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'wt')}\n`)

  const claudeDir = join(world, 'claude')
  const sessionFileFor = (realPath, name) => {
    const dir = join(claudeDir, 'projects', encodeProjectPath(realPath))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), '{"type":"summary","summary":"hello"}\n')
  }
  sessionFileFor(repo, 'root-session.jsonl')
  sessionFileFor(subdir, 'subdir-session.jsonl')
  sessionFileFor(worktree, 'wt-session.jsonl')
  sessionFileFor(scratch, 'scratch-session.jsonl')
  writeFileSync(
    join(claudeDir, '.claude.json'),
    JSON.stringify({ projects: { [repo]: {}, [subdir]: {}, [worktree]: {}, [scratch]: {} } })
  )

  return { repo, subdir, worktree, scratch, claudeDir }
}

test('repoRootFor resolves roots, subdirs, and worktree checkouts', (t) => {
  const { repo, subdir, worktree, scratch } = buildWorld(t)

  assert.equal(repoRootFor(repo), repo)
  assert.equal(repoRootFor(subdir), repo)
  assert.equal(repoRootFor(worktree), repo)
  assert.equal(repoRootFor(scratch), null)
})

test('listRepos folds subdirs and worktrees into one repo and drops scratch dirs', (t) => {
  const { repo, subdir, worktree, claudeDir } = buildWorld(t)

  const repos = listRepos(claudeDir)
  assert.equal(repos.length, 1)

  const [entry] = repos
  assert.equal(entry.path, repo)
  assert.equal(entry.id, encodeProjectPath(repo))
  assert.equal(entry.sessionCount, 3)
  const memberIds = entry.members.map((m) => m.id)
  assert.ok(memberIds.includes(encodeProjectPath(repo)))
  assert.ok(memberIds.includes(encodeProjectPath(subdir)))
  assert.ok(memberIds.includes(encodeProjectPath(worktree)))
})

test('listRepos seeds managed repos that have no sessions yet', (t) => {
  const { repo, scratch, claudeDir } = buildWorld(t)

  // A second repo Basecamp manages (an intent points at it) but Claude has
  // never run in: it must still appear. Non-repo managed paths must not.
  const managed = join(dirname(repo), 'managed-repo')
  mkdirSync(join(managed, '.git'), { recursive: true })

  const repos = listRepos(claudeDir, [managed, scratch, null, '/does/not/exist'])
  const paths = repos.map((r) => r.path).sort()
  assert.deepEqual(paths, [managed, repo].sort())
  const seeded = repos.find((r) => r.path === managed)
  assert.equal(seeded.sessionCount, 0)
  assert.equal(seeded.members.length, 1)
})

test('listRepoSessions merges sessions across all member dirs, newest first', (t) => {
  const { claudeDir } = buildWorld(t)

  const [entry] = listRepos(claudeDir)
  const sessions = listRepoSessions(claudeDir, entry)
  assert.equal(sessions.length, 3)
  const ids = sessions.map((s) => s.id).sort()
  assert.deepEqual(ids, ['root-session', 'subdir-session', 'wt-session'])
  // Each session keeps its true projectId so /api/session deep links still resolve.
  for (const session of sessions) {
    assert.ok(session.projectId)
  }
})

test('normalizeStorePaths re-keys subdir records to the repo root and dedupes managers', (t) => {
  const { repo, subdir, worktree, scratch } = buildWorld(t)
  const home = mkdtempSync(join(tmpdir(), 'basecamp-normalize-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const stores = {
    managers: new Store(home, 'managers'),
    goals: new Store(home, 'goals'),
    intents: new Store(home, 'intents'),
    routines: new Store(home, 'routines'),
    messages: new Store(home, 'messages'),
  }

  const stale = stores.managers.insert({ projectPath: subdir, updatedAt: 100 })
  const fresh = stores.managers.insert({ projectPath: worktree, updatedAt: 200 })
  stores.managers.insert({ key: 'lastSeen' }) // meta record must survive untouched
  stores.goals.insert({ projectPath: subdir, title: 'ship it' })
  stores.messages.insert({ projectPath: worktree, role: 'user', text: 'hello' })
  stores.intents.insert({ projectPath: scratch, label: 'non-repo stays put' })

  normalizeStorePaths(stores)

  const managers = stores.managers.list().filter((m) => m.projectPath)
  assert.equal(managers.length, 1)
  assert.equal(managers[0].projectPath, repo)
  assert.equal(managers[0].id, fresh.id)
  assert.equal(stores.managers.get(stale.id), null)
  assert.ok(stores.managers.list().some((m) => m.key === 'lastSeen'))
  assert.equal(stores.goals.list()[0].projectPath, repo)
  assert.equal(stores.messages.list()[0].projectPath, repo)
  assert.equal(stores.intents.list()[0].projectPath, scratch)
})

test('project and session endpoints serve the grouped repo view', async (t) => {
  const { repo, subdir, claudeDir } = buildWorld(t)
  const basecampHome = mkdtempSync(join(tmpdir(), 'basecamp-repos-home-'))
  const { server } = await startServer({ port: 0, claudeDir, basecampHome })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => {
    server.close()
    rmSync(basecampHome, { recursive: true, force: true })
  })

  const projects = await (await fetch(`${base}/api/projects`)).json()
  assert.equal(projects.length, 1)
  assert.equal(projects[0].path, repo)
  assert.equal(projects[0].sessionCount, 3)

  const repoSessions = await (
    await fetch(`${base}/api/repo/sessions?path=${encodeURIComponent(repo)}`)
  ).json()
  assert.equal(repoSessions.length, 3)

  const merged = await (
    await fetch(`${base}/api/sessions?project=${encodeProjectPath(repo)}`)
  ).json()
  assert.equal(merged.length, 3)

  // A non-root project id still answers for exactly its own directory.
  const single = await (
    await fetch(`${base}/api/sessions?project=${encodeProjectPath(subdir)}`)
  ).json()
  assert.equal(single.length, 1)
  assert.equal(single[0].id, 'subdir-session')
})
