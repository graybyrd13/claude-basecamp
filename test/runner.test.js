import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { Store } from '../src/lib/store.js'
import { launchRun, approveRun, denyRun } from '../src/lib/runner.js'

/**
 * Best-effort temp-dir removal. Windows can hold the just-ended log stream's
 * file handle past any reasonable retry window; these dirs live under the OS
 * temp root, so leaving one behind is never worth failing a test over.
 */
function cleanup(...dirs) {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* locked on Windows — the OS temp cleaner owns it now */
    }
  }
}

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-runner-test-'))
  mkdirSync(join(home, 'logs'), { recursive: true })
  return {
    home,
    routines: new Store(home, 'routines'),
    runs: new Store(home, 'runs'),
    updates: new Store(home, 'updates'),
    settings: new Store(home, 'settings'),
  }
}

function tempProjectDir() {
  return mkdtempSync(join(tmpdir(), 'basecamp-runner-project-'))
}

/** A fake `claude` child process the test drives by hand. */
function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => child.emit('exit', null, 'SIGTERM')
  return child
}

/** Write stream-json lines, close stdout, then fire 'exit' once they've drained. */
async function finishTurn(child, lines, code = 0, signal = null) {
  for (const line of lines) child.stdout.write(JSON.stringify(line) + '\n')
  child.stdout.end()
  await once(child.stdout, 'end')
  child.emit('exit', code, signal)
}

/** Poll until the run leaves 'running' — the exit handler is async (git lookups). */
async function settled(stores, runId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const run = stores.runs.get(runId)
    if (run && run.status !== 'running') return run
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return stores.runs.get(runId)
}

test('launchRun spawns claude with the expected args and reaches "succeeded"', async () => {
  const stores = tempStores()
  const projectPath = tempProjectDir()
  const spawnCalls = []
  const children = []
  const fakeSpawn = (cmd, args, opts) => {
    spawnCalls.push({ cmd, args, opts })
    const child = fakeChild()
    children.push(child)
    return child
  }

  const run = launchRun(stores, { projectPath, prompt: 'do the thing', model: 'opus', effort: 'low' }, fakeSpawn)
  assert.equal(run.status, 'running')
  assert.equal(run.effort, 'low')
  assert.equal(spawnCalls[0].cmd, 'claude')
  assert.deepEqual(
    spawnCalls[0].args.slice(0, 4),
    ['-p', 'do the thing', '--output-format', 'stream-json']
  )
  assert.ok(spawnCalls[0].args.includes('--permission-mode'))
  assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--model') + 1], 'opus')
  assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--effort') + 1], 'low')
  assert.throws(
    () => launchRun(stores, { projectPath, prompt: 'x', effort: 'ultra' }, fakeSpawn),
    /Invalid effort/
  )
  assert.throws(
    () => launchRun(stores, { projectPath, prompt: 'x', model: 'opus; rm -rf /' }, fakeSpawn),
    /Invalid model/
  )

  await finishTurn(children[0], [
    { type: 'system', subtype: 'init', session_id: 'sess-1' },
    { type: 'result', subtype: 'success', is_error: false, result: 'all done', session_id: 'sess-1' },
  ])

  const finished = await settled(stores, run.id)
  assert.equal(finished.status, 'succeeded')
  assert.equal(finished.resultText, 'all done')
  assert.equal(finished.sessionId, 'sess-1')
  cleanup(stores.home, projectPath)
})

test('launchRun pauses as "awaiting-approval" when Claude reports a permission denial', async () => {
  const stores = tempStores()
  const projectPath = tempProjectDir()
  const children = []
  const fakeSpawn = () => {
    const child = fakeChild()
    children.push(child)
    return child
  }

  const run = launchRun(stores, { projectPath, prompt: 'clean up temp files' }, fakeSpawn)

  const denial = {
    tool_name: 'Bash',
    tool_use_id: 'toolu_1',
    tool_input: { command: 'rm -rf build' },
  }
  await finishTurn(children[0], [
    { type: 'system', subtype: 'init', session_id: 'sess-2' },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'I could not run that command without approval.',
      session_id: 'sess-2',
      permission_denials: [denial],
    },
  ])

  const paused = await settled(stores, run.id)
  assert.equal(paused.status, 'awaiting-approval')
  assert.equal(paused.endedAt, null)
  assert.equal(paused.permissionDenials.length, 1)
  assert.equal(paused.permissionDenials[0].tool_name, 'Bash')

  const updates = stores.updates.list()
  assert.equal(updates.length, 1)
  assert.equal(updates[0].kind, 'run-awaiting-approval')
  assert.match(updates[0].body, /rm -rf build/)

  cleanup(stores.home, projectPath)
})

test('approveRun resumes the paused session with elevated permission for just that turn', async () => {
  const stores = tempStores()
  const projectPath = tempProjectDir()
  const run = stores.runs.insert({
    projectPath,
    prompt: 'clean up temp files',
    permissionMode: 'acceptEdits',
    model: null,
    status: 'awaiting-approval',
    startedAt: Date.now(),
    endedAt: null,
    resultText: null,
    costUsd: null,
    numTurns: null,
    sessionId: 'sess-2',
    error: null,
    commits: [],
    permissionDenials: [{ tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'rm -rf build' } }],
  })

  const spawnCalls = []
  const children = []
  const fakeSpawn = (cmd, args, opts) => {
    spawnCalls.push({ cmd, args, opts })
    const child = fakeChild()
    children.push(child)
    return child
  }

  const resumed = approveRun(stores, run.id, {}, fakeSpawn)
  assert.equal(resumed.status, 'running')
  assert.deepEqual(resumed.permissionDenials, [])

  assert.equal(spawnCalls[0].cmd, 'claude')
  assert.ok(spawnCalls[0].args.includes('--resume'))
  assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--resume') + 1], 'sess-2')
  assert.ok(spawnCalls[0].args.includes('--permission-mode'))
  assert.equal(
    spawnCalls[0].args[spawnCalls[0].args.indexOf('--permission-mode') + 1],
    'bypassPermissions'
  )
  // The resume prompt should reference what was denied, so Claude knows what to retry.
  assert.match(spawnCalls[0].args[1], /Bash/)
  assert.match(spawnCalls[0].args[1], /rm -rf build/)

  await finishTurn(children[0], [
    { type: 'result', subtype: 'success', is_error: false, result: 'done now', session_id: 'sess-2' },
  ])
  assert.equal((await settled(stores, run.id)).status, 'succeeded')

  cleanup(stores.home, projectPath)
})

test('approveRun rejects runs that are not awaiting approval', () => {
  const stores = tempStores()
  const run = stores.runs.insert({ projectPath: '/tmp', status: 'running', sessionId: 's' })
  assert.throws(() => approveRun(stores, run.id, {}, () => fakeChild()), /awaiting approval/)
  cleanup(stores.home)
})

test('denyRun marks the run denied without spawning anything', () => {
  const stores = tempStores()
  const run = stores.runs.insert({
    projectPath: '/tmp/project',
    prompt: 'clean up',
    status: 'awaiting-approval',
    sessionId: 'sess-3',
    permissionDenials: [{ tool_name: 'Write', tool_use_id: 't', tool_input: { file_path: '/tmp/x' } }],
  })

  const denied = denyRun(stores, run.id)
  assert.equal(denied.status, 'denied')
  assert.ok(denied.endedAt)

  const updates = stores.updates.list()
  assert.equal(updates.length, 1)
  assert.equal(updates[0].kind, 'run-denied')

  cleanup(stores.home)
})

test('denyRun rejects runs that are not awaiting approval', () => {
  const stores = tempStores()
  const run = stores.runs.insert({ projectPath: '/tmp', status: 'succeeded' })
  assert.throws(() => denyRun(stores, run.id), /awaiting approval/)
  cleanup(stores.home)
})
