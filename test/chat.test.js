import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { Store } from '../src/lib/store.js'
import { sendChatMessage } from '../src/lib/chat.js'

/** Best-effort temp-dir removal — see the identical note in runner.test.js. */
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
  const home = mkdtempSync(join(tmpdir(), 'basecamp-chat-test-'))
  return {
    home,
    managers: new Store(home, 'managers'),
    messages: new Store(home, 'messages'),
  }
}

function tempProjectDir() {
  return mkdtempSync(join(tmpdir(), 'basecamp-chat-project-'))
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
async function finishTurn(child, lines, code = 0) {
  for (const line of lines) child.stdout.write(JSON.stringify(line) + '\n')
  child.stdout.end()
  await once(child.stdout, 'end')
  child.emit('exit', code, null)
}

function recordingSpawn(spawnCalls, children) {
  return (cmd, args, opts) => {
    spawnCalls.push({ cmd, args, opts })
    const child = fakeChild()
    children.push(child)
    return child
  }
}

const turnEvents = (sessionId, text) => [
  { type: 'system', subtype: 'init', session_id: sessionId },
  { type: 'assistant', message: { content: [{ type: 'text', text }] } },
  { type: 'result', session_id: sessionId },
]

test('chat defaults: acceptEdits, no --model, curl allowlist, prefs and session persisted', async () => {
  const stores = tempStores()
  const projectPath = tempProjectDir()
  const spawnCalls = []
  const children = []
  const events = []

  const turn = sendChatMessage(
    stores,
    { projectPath, message: 'hello', port: 4777 },
    (e) => events.push(e),
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[0], turnEvents('sess-1', 'hi there'))
  await turn

  const { cmd, args } = spawnCalls[0]
  assert.equal(cmd, 'claude')
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits')
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'Bash(curl:*)')
  assert.ok(!args.includes('--model'), 'no model flag means Claude Code default')
  assert.ok(!args.includes('--resume'), 'first message starts a fresh session')

  const manager = stores.managers.list().find((m) => m.projectPath === projectPath)
  assert.equal(manager.sessionId, 'sess-1')
  assert.equal(manager.permissionMode, 'acceptEdits')
  assert.equal(manager.model, null)

  assert.ok(events.some((e) => e.type === 'text' && e.text === 'hi there'))
  assert.deepEqual(events.at(-1), { type: 'done', error: null })
  cleanup(stores.home, projectPath)
})

test('chosen model and permission mode reach the CLI and stick for later messages', async () => {
  const stores = tempStores()
  const projectPath = tempProjectDir()
  const spawnCalls = []
  const children = []

  const first = sendChatMessage(
    stores,
    { projectPath, message: 'plan the release', port: 4777, model: 'opus', permissionMode: 'plan', effort: 'high' },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[0], turnEvents('sess-9', 'planned'))
  await first

  assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--model') + 1], 'opus')
  assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--permission-mode') + 1], 'plan')
  assert.equal(spawnCalls[0].args[spawnCalls[0].args.indexOf('--effort') + 1], 'high')

  const manager = stores.managers.list().find((m) => m.projectPath === projectPath)
  assert.equal(manager.model, 'opus')
  assert.equal(manager.permissionMode, 'plan')
  assert.equal(manager.effort, 'high')

  // A message that names no model/mode/effort inherits the repo's last-used choice.
  const second = sendChatMessage(
    stores,
    { projectPath, message: 'continue', port: 4777 },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[1], turnEvents('sess-9', 'continuing'))
  await second

  const args = spawnCalls[1].args
  assert.equal(args[args.indexOf('--model') + 1], 'opus')
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'plan')
  assert.equal(args[args.indexOf('--effort') + 1], 'high')
  assert.equal(args[args.indexOf('--resume') + 1], 'sess-9')

  // Explicit nulls reset to the Claude Code defaults and persist that.
  const third = sendChatMessage(
    stores,
    { projectPath, message: 'back to default', port: 4777, model: null, effort: null },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[2], turnEvents('sess-9', 'ok'))
  await third

  assert.ok(!spawnCalls[2].args.includes('--model'))
  assert.ok(!spawnCalls[2].args.includes('--effort'))
  const after = stores.managers.list().find((m) => m.projectPath === projectPath)
  assert.equal(after.model, null)
  assert.equal(after.effort, null)
  assert.equal(after.permissionMode, 'plan')
  cleanup(stores.home, projectPath)
})

test('invalid permission mode or model is rejected before anything is persisted', () => {
  const stores = tempStores()
  const projectPath = tempProjectDir()
  const spawnCalls = []
  const children = []
  const spawnFn = recordingSpawn(spawnCalls, children)

  assert.throws(
    () => sendChatMessage(stores, { projectPath, message: 'x', port: 1, permissionMode: 'yolo' }, () => {}, spawnFn),
    /Invalid permission mode/
  )
  assert.throws(
    () => sendChatMessage(stores, { projectPath, message: 'x', port: 1, model: 'opus; rm -rf /' }, () => {}, spawnFn),
    /Invalid model/
  )
  assert.throws(
    () => sendChatMessage(stores, { projectPath, message: 'x', port: 1, effort: 'ultra' }, () => {}, spawnFn),
    /Invalid effort/
  )

  assert.equal(spawnCalls.length, 0, 'nothing spawned')
  assert.equal(stores.messages.list().length, 0, 'rejected message is not written to history')
  assert.equal(stores.managers.list().length, 0, 'no manager record created')
  cleanup(stores.home, projectPath)
})
