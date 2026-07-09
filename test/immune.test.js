import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/lib/store.js'
import { mineSession, reflexVerdict, immuneStats, commandPrefix } from '../src/lib/immune.js'
import { installReflexHook, uninstallReflexHook, reflexHookInstalled } from '../src/lib/hook-installer.js'

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-immune-'))
  return {
    home,
    antibodies: new Store(home, 'antibodies'),
    reflex: new Store(home, 'reflex'),
    runs: new Store(home, 'runs'),
    updates: new Store(home, 'updates'),
  }
}

function writeTranscript(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-transcript-'))
  const file = join(dir, 's.jsonl')
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  return { dir, file }
}

const assistantBash = (command) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] },
})
const userText = (text) => ({ type: 'user', message: { content: text } })

test('commandPrefix normalizes to two tokens', () => {
  assert.equal(commandPrefix('rm -rf build/'), 'rm -rf')
  assert.equal(commandPrefix('npm publish --otp=1'), 'npm publish')
  assert.equal(commandPrefix('  '), null)
})

test('mineSession finds an interruption after a tool call', async () => {
  const { dir, file } = writeTranscript([
    assistantBash('rm -rf build/'),
    userText('[Request interrupted by user]'),
  ])
  const signals = await mineSession(file, { projectPath: '/tmp/x', sessionId: 's', date: 1 })
  assert.equal(signals.length, 1)
  assert.equal(signals[0].kind, 'interrupted')
  assert.deepEqual(signals[0].pattern, { tool: 'Bash', match: 'rm -rf' })
  rmSync(dir, { recursive: true, force: true })
})

test('mineSession finds corrections and skips benign commands', async () => {
  const { dir, file } = writeTranscript([
    assistantBash('git status'),
    userText("no, don't touch the config"),
    assistantBash('git push --force origin main'),
    userText('stop! never force push'),
    assistantBash('ls -la'),
    userText('thanks, looks good'),
  ])
  const signals = await mineSession(file, { projectPath: '/tmp/x', sessionId: 's', date: 1 })
  // 'git status' and 'ls' are benign; only the force-push correction lands.
  assert.equal(signals.length, 1)
  assert.equal(signals[0].kind, 'correction')
  assert.equal(signals[0].pattern.match, 'git push')
  assert.match(signals[0].evidence.quote, /never force push/)
  rmSync(dir, { recursive: true, force: true })
})

test('reflexVerdict allows single exposures and denies repeated ones', () => {
  const stores = tempStores()
  stores.antibodies.insert({
    key: 'Bash::git push',
    pattern: { tool: 'Bash', match: 'git push' },
    kinds: ['correction'],
    count: 1,
    evidence: [{ quote: 'never force push', date: Date.now(), projectPath: '/tmp/x' }],
    lastSeen: Date.now(),
    muted: false,
  })
  const once = reflexVerdict(stores, { toolName: 'Bash', toolInput: { command: 'git push --force' } })
  assert.equal(once.decision, 'allow')

  const ab = stores.antibodies.list()[0]
  stores.antibodies.update(ab.id, { count: 3 })
  const repeated = reflexVerdict(stores, { toolName: 'Bash', toolInput: { command: 'git push --force' } })
  assert.equal(repeated.decision, 'deny')
  assert.match(repeated.reason, /3 times/)
  assert.match(repeated.reason, /never force push/)

  stores.antibodies.update(ab.id, { muted: true })
  const muted = reflexVerdict(stores, { toolName: 'Bash', toolInput: { command: 'git push --force' } })
  assert.equal(muted.decision, 'allow')
  rmSync(stores.home, { recursive: true, force: true })
})

test('reflexVerdict never blocks unmatched or benign actions', () => {
  const stores = tempStores()
  assert.equal(reflexVerdict(stores, { toolName: 'Bash', toolInput: { command: 'git status' } }).decision, 'allow')
  assert.equal(reflexVerdict(stores, { toolName: 'Read', toolInput: { file_path: '/x' } }).decision, 'allow')
  assert.equal(reflexVerdict(stores, { toolName: 'Bash', toolInput: {} }).decision, 'allow')
  rmSync(stores.home, { recursive: true, force: true })
})

test('immuneStats derives relationship guidance from antibody mix', () => {
  const stores = tempStores()
  for (let i = 0; i < 4; i++) {
    stores.antibodies.insert({
      key: `bash::cmd-${i}`,
      pattern: { tool: 'Bash', match: `cmd ${i}` },
      kinds: ['correction'],
      count: 1,
      evidence: [{ projectPath: '/tmp/drifty', quote: 'no', date: 1 }],
      lastSeen: 1,
      muted: false,
    })
  }
  const stats = immuneStats(stores)
  assert.equal(stats.antibodies, 4)
  assert.equal(stats.corrections, 4)
  assert.ok(stats.claudeNeeds.some((n) => /CLAUDE\.md|conventions/i.test(n)))
  assert.ok(Array.isArray(stats.userNeeds) && stats.userNeeds.length > 0)
  rmSync(stores.home, { recursive: true, force: true })
})

test('reflex hook install/uninstall round-trips settings.json safely', () => {
  const claudeDir = mkdtempSync(join(tmpdir(), 'basecamp-claude-'))
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [] }] } }))

  assert.equal(reflexHookInstalled(claudeDir), false)
  const first = installReflexHook(claudeDir, 4747)
  assert.equal(first.already, false)
  assert.equal(reflexHookInstalled(claudeDir), true)

  const again = installReflexHook(claudeDir, 4747)
  assert.equal(again.already, true)

  const settings = JSON.parse(readFileSyncStr(join(claudeDir, 'settings.json')))
  assert.equal(settings.theme, 'dark') // untouched
  assert.ok(settings.hooks.Stop) // untouched
  assert.equal(settings.hooks.PreToolUse.length, 1)

  uninstallReflexHook(claudeDir)
  assert.equal(reflexHookInstalled(claudeDir), false)
  rmSync(claudeDir, { recursive: true, force: true })
})

import { readFileSync } from 'node:fs'
function readFileSyncStr(p) {
  return readFileSync(p, 'utf8')
}
