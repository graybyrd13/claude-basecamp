import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Store } from '../src/lib/store.js'
import {
  createCleanRoom,
  cleanRoomDiff,
  cleanRoomPatch,
  applyCleanRoom,
  discardCleanRoom,
  sweepCleanRooms,
} from '../src/lib/cleanroom.js'

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-cleanroom-repo-'))
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.t',
        GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.t',
      },
    }).trim()
  git('init', '-b', 'main')
  // Windows checks out merged files with CRLF by default, which would break
  // byte-for-byte content assertions after apply. Worktrees share this config.
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  git('add', '.')
  git('commit', '-m', 'first commit')
  return { dir, git }
}

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-cleanroom-home-'))
  return { home, runs: new Store(home, 'runs') }
}

/** Commit a change inside the clean room, as a convergence run would. */
function commitInRoom(roomPath, file, content, message) {
  writeFileSync(join(roomPath, file), content)
  const git = (...args) =>
    execFileSync('git', ['-C', roomPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.t',
        GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.t',
      },
    })
  git('add', '.')
  git('commit', '-m', message)
}

const cleanupAll = (...dirs) => dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))

test('a clean room isolates work from the main checkout', async () => {
  const { dir } = makeRepo()
  const stores = tempStores()
  const room = await createCleanRoom(stores, 'run-1234-example', dir)

  assert.ok(existsSync(room.path))
  assert.equal(room.state, 'open')

  commitInRoom(room.path, 'a.txt', 'changed by claude\n', 'fix: the thing')

  // The main checkout is untouched — that is the whole point.
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'one\n')

  const diff = await cleanRoomDiff(dir, room)
  assert.equal(diff.commits.length, 1)
  assert.equal(diff.commits[0].subject, 'fix: the thing')
  assert.match(diff.stat, /1 file changed/)

  const patch = await cleanRoomPatch(dir, room)
  assert.match(patch, /changed by claude/)
  cleanupAll(dir, stores.home)
})

test('apply fast-forwards the repo and removes room and branch', async () => {
  const { dir, git } = makeRepo()
  const stores = tempStores()
  const room = await createCleanRoom(stores, 'run-ff', dir)
  commitInRoom(room.path, 'a.txt', 'improved\n', 'fix: improve')
  const run = stores.runs.insert({ projectPath: dir, cleanRoom: room })

  const applied = await applyCleanRoom(stores, stores.runs.get(run.id))
  assert.equal(applied.cleanRoom.state, 'applied')
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'improved\n')
  assert.equal(existsSync(room.path), false)
  assert.ok(!git('branch', '--list', room.branch))
  cleanupAll(dir, stores.home)
})

test('apply merges when the repo moved, and aborts cleanly on conflict', async () => {
  const { dir, git } = makeRepo()
  const stores = tempStores()

  // Divergent but non-conflicting: merge succeeds.
  const room1 = await createCleanRoom(stores, 'run-merge', dir)
  commitInRoom(room1.path, 'feature.txt', 'new file\n', 'feat: add feature')
  writeFileSync(join(dir, 'other.txt'), 'parallel work\n')
  git('add', '.')
  git('commit', '-m', 'parallel commit on main')
  const run1 = stores.runs.insert({ projectPath: dir, cleanRoom: room1 })
  await applyCleanRoom(stores, stores.runs.get(run1.id))
  assert.equal(readFileSync(join(dir, 'feature.txt'), 'utf8'), 'new file\n')

  // Conflicting: apply throws, repo left clean (no mid-merge state).
  const room2 = await createCleanRoom(stores, 'run-conflict', dir)
  commitInRoom(room2.path, 'a.txt', 'room version\n', 'fix: room edit')
  writeFileSync(join(dir, 'a.txt'), 'main version\n')
  git('add', '.')
  git('commit', '-m', 'conflicting main edit')
  const run2 = stores.runs.insert({ projectPath: dir, cleanRoom: room2 })

  await assert.rejects(() => applyCleanRoom(stores, stores.runs.get(run2.id)), /did not apply cleanly/)
  assert.equal(git('status', '--porcelain'), '') // no conflict markers left behind
  assert.equal(stores.runs.get(run2.id).cleanRoom.state, 'open') // still reviewable
  cleanupAll(dir, stores.home)
})

test('discard removes room and branch without touching the repo', async () => {
  const { dir, git } = makeRepo()
  const stores = tempStores()
  const room = await createCleanRoom(stores, 'run-discard', dir)
  commitInRoom(room.path, 'a.txt', 'unwanted\n', 'fix: unwanted')
  const run = stores.runs.insert({ projectPath: dir, cleanRoom: room })

  const discarded = await discardCleanRoom(stores, stores.runs.get(run.id))
  assert.equal(discarded.cleanRoom.state, 'discarded')
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'one\n')
  assert.equal(existsSync(room.path), false)
  assert.ok(!git('branch', '--list', room.branch))
  cleanupAll(dir, stores.home)
})

test('sweep discards rooms of long-settled runs but spares fresh and live ones', async () => {
  const { dir } = makeRepo()
  const stores = tempStores()
  const oldRoom = await createCleanRoom(stores, 'run-old', dir)
  const freshRoom = await createCleanRoom(stores, 'run-fresh', dir)
  const eightDays = 8 * 24 * 60 * 60 * 1000

  stores.runs.insert({ projectPath: dir, cleanRoom: oldRoom, status: 'succeeded', endedAt: Date.now() - eightDays })
  stores.runs.insert({ projectPath: dir, cleanRoom: freshRoom, status: 'succeeded', endedAt: Date.now() })

  await sweepCleanRooms(stores)
  assert.equal(existsSync(oldRoom.path), false)
  assert.equal(existsSync(freshRoom.path), true)
  cleanupAll(dir, stores.home)
})
