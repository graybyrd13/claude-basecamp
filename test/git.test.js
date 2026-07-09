import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { gitStatus, headSha, commitsBetween } from '../src/lib/git.js'

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-git-test-'))
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
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  git('add', '.')
  git('commit', '-m', 'first commit')
  return { dir, git }
}

test('gitStatus reports branch, dirty count, and last commit', async () => {
  const { dir } = makeRepo()
  const status = await gitStatus(dir)
  assert.equal(status.branch, 'main')
  assert.equal(status.dirtyFiles, 0)
  assert.equal(status.commit.subject, 'first commit')
  assert.ok(status.commit.sha.length >= 7)

  writeFileSync(join(dir, 'b.txt'), 'dirty\n')
  // Cache TTL is 10s, so a second call within it returns the cached snapshot.
  const cached = await gitStatus(dir)
  assert.equal(cached.dirtyFiles, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('gitStatus returns null outside a repo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-notrepo-'))
  assert.equal(await gitStatus(dir), null)
  rmSync(dir, { recursive: true, force: true })
})

test('commitsBetween lists commits made between two shas', async () => {
  const { dir, git } = makeRepo()
  const before = await headSha(dir)
  writeFileSync(join(dir, 'c.txt'), 'two\n')
  git('add', '.')
  git('commit', '-m', 'second commit')
  const after = await headSha(dir)

  const commits = await commitsBetween(dir, before, after)
  assert.equal(commits.length, 1)
  assert.equal(commits[0].subject, 'second commit')

  assert.deepEqual(await commitsBetween(dir, before, before), [])
  assert.deepEqual(await commitsBetween(dir, null, after), [])
  rmSync(dir, { recursive: true, force: true })
})
