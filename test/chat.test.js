import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { homedir } from 'node:os'
import { Store } from '../src/lib/store.js'
import { sendChatMessage, chatHistory, clearChat, compactChat, GLOBAL_CHAT } from '../src/lib/chat.js'

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
    notifications: new Store(home, 'notifications'),
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

test('the global manager runs from home with the repo map in its charter', async () => {
  const stores = tempStores()
  const spawnCalls = []
  const children = []

  const turn = sendChatMessage(
    stores,
    { projectPath: GLOBAL_CHAT, message: 'what needs attention?', port: 4777, context: '- /repo/a — 3 sessions' },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[0], turnEvents('sess-g', 'looking'))
  await turn

  const { args, opts } = spawnCalls[0]
  assert.equal(opts.cwd, homedir()) // full machine access, not one repo
  const system = args[args.indexOf('--append-system-prompt') + 1]
  assert.match(system, /one persistent agent for this entire machine/)
  assert.match(system, /- \/repo\/a — 3 sessions/) // live repo map injected
  assert.match(system, /MANAGER\.md/)

  const manager = stores.managers.list().find((m) => m.projectPath === GLOBAL_CHAT)
  assert.equal(manager.sessionId, 'sess-g')
  cleanup(stores.home)
})

test('clear hides history behind the watermark and drops the session', async () => {
  const stores = tempStores()
  const spawnCalls = []
  const children = []

  const turn = sendChatMessage(
    stores,
    { projectPath: GLOBAL_CHAT, message: 'remember the plan', port: 4777 },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[0], turnEvents('sess-g1', 'noted'))
  await turn
  assert.equal(chatHistory(stores, GLOBAL_CHAT).length, 2) // user + assistant

  clearChat(stores, GLOBAL_CHAT)
  assert.equal(chatHistory(stores, GLOBAL_CHAT).length, 0)
  assert.equal(stores.messages.list().length, 2, 'nothing deleted from disk')

  const next = sendChatMessage(
    stores,
    { projectPath: GLOBAL_CHAT, message: 'fresh start', port: 4777 },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[1], turnEvents('sess-g2', 'hello again'))
  await next
  assert.ok(!spawnCalls[1].args.includes('--resume'), 'cleared chat starts a fresh session')
  cleanup(stores.home)
})

test('compact collapses history to a handoff brief that seeds the next session', async () => {
  const stores = tempStores()
  const spawnCalls = []
  const children = []

  const turn = sendChatMessage(
    stores,
    { projectPath: GLOBAL_CHAT, message: 'we decided to ship Friday', port: 4777 },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[0], turnEvents('sess-c1', 'noted: shipping Friday'))
  await turn

  const compacting = compactChat(stores, { target: GLOBAL_CHAT, port: 4777 }, recordingSpawn(spawnCalls, children))
  // The compact turn resumes the session read-only and answers with the brief.
  const compactArgs = spawnCalls[1].args
  assert.equal(compactArgs[compactArgs.indexOf('--resume') + 1], 'sess-c1')
  assert.equal(compactArgs[compactArgs.indexOf('--permission-mode') + 1], 'plan')
  children[1].stdout.write(JSON.stringify({ result: 'BRIEF: shipping Friday; no open threads.' }) + '\n')
  children[1].stdout.end()
  await once(children[1].stdout, 'end')
  children[1].emit('exit', 0, null)
  const { summary } = await compacting
  assert.match(summary, /shipping Friday/)

  // History is now just the brief; the next turn starts fresh, seeded with it.
  const history = chatHistory(stores, GLOBAL_CHAT)
  assert.equal(history.length, 1)
  assert.equal(history[0].role, 'summary')

  const next = sendChatMessage(
    stores,
    { projectPath: GLOBAL_CHAT, message: 'status?', port: 4777 },
    () => {},
    recordingSpawn(spawnCalls, children)
  )
  await finishTurn(children[2], turnEvents('sess-c2', 'on track'))
  await next
  const args = spawnCalls[2].args
  assert.ok(!args.includes('--resume'))
  assert.match(args[args.indexOf('--append-system-prompt') + 1], /Handoff brief[\s\S]*shipping Friday/)
  cleanup(stores.home)
})

test('compact with no session just clears; a failed compact leaves history intact', async () => {
  const stores = tempStores()
  const result = await compactChat(stores, { target: GLOBAL_CHAT, port: 4777 }, () => {
    throw new Error('must not spawn without a session')
  })
  assert.equal(result.cleared, true)

  // Now with a session but a summary turn that produces nothing.
  stores.managers.insert({ projectPath: GLOBAL_CHAT, sessionId: 'sess-x', historySince: 0 })
  stores.messages.insert({ projectPath: GLOBAL_CHAT, role: 'user', text: 'important context' })
  const children = []
  const failing = compactChat(stores, { target: GLOBAL_CHAT, port: 4777 }, recordingSpawn([], children))
  children[0].stdout.end()
  children[0].emit('exit', 1, null)
  await assert.rejects(() => failing, /no summary/)
  assert.equal(chatHistory(stores, GLOBAL_CHAT).length, 1, 'history untouched on failure')
  cleanup(stores.home)
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
