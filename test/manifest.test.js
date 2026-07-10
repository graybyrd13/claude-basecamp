import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/lib/store.js'
import { BUILTINS } from '../src/lib/reconcile.js'
import {
  readManifest,
  manifestStatus,
  adoptManifest,
  dropManifest,
  writeManifest,
  watchManifests,
  manifestPath,
} from '../src/lib/manifest.js'
import { getSettings } from '../src/lib/settings.js'

function world() {
  const repo = mkdtempSync(join(tmpdir(), 'basecamp-manifest-repo-'))
  const home = mkdtempSync(join(tmpdir(), 'basecamp-manifest-home-'))
  const stores = {
    home,
    intents: new Store(home, 'intents'),
    manifests: new Store(home, 'manifests'),
    settings: new Store(home, 'settings'),
    updates: new Store(home, 'updates'),
  }
  return { repo, stores, cleanup: () => { rmSync(repo, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }) } }
}

function putManifest(repo, content) {
  mkdirSync(join(repo, '.basecamp'), { recursive: true })
  writeFileSync(manifestPath(repo), typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

const GOOD = {
  version: 1,
  intents: [
    { builtin: 'tests-green', intervalMinutes: 60, autonomy: 'propose' },
    { text: 'README documents every CLI flag', intervalMinutes: 720 },
  ],
  budgetUsd: 5,
}

test('readManifest validates shape, builtins, and autonomy', () => {
  const { repo, cleanup } = world()

  assert.equal(readManifest(repo, BUILTINS), null) // no manifest at all

  putManifest(repo, 'not json {')
  assert.match(readManifest(repo, BUILTINS).error, /valid JSON/)

  putManifest(repo, { version: 2, intents: [] })
  assert.match(readManifest(repo, BUILTINS).error, /version/)

  putManifest(repo, { version: 1, intents: [{ builtin: 'nope' }] })
  assert.match(readManifest(repo, BUILTINS).error, /Unknown builtin/)

  putManifest(repo, { version: 1, intents: [{ builtin: 'tests-green', autonomy: 'yolo' }] })
  assert.match(readManifest(repo, BUILTINS).error, /autonomy/)

  putManifest(repo, GOOD)
  const manifest = readManifest(repo, BUILTINS)
  assert.equal(manifest.error, undefined)
  assert.equal(manifest.intents.length, 2)
  assert.equal(manifest.intents[0].builtin, 'tests-green')
  assert.equal(manifest.budgetUsd, 5)
  assert.ok(manifest.hash)
  cleanup()
})

test('adoption is explicit: a manifest alone materializes nothing', () => {
  const { repo, stores, cleanup } = world()
  putManifest(repo, GOOD)

  const status = manifestStatus(stores, repo, BUILTINS)
  assert.equal(status.present, true)
  assert.equal(status.adopted, false)
  assert.equal(stores.intents.list().length, 0) // nothing runs without consent
  cleanup()
})

test('adopt materializes intents, applies the budget, and pins the hash', () => {
  const { repo, stores, cleanup } = world()
  putManifest(repo, GOOD)

  const status = adoptManifest(stores, repo, BUILTINS)
  assert.equal(status.adopted, true)
  assert.equal(status.changed, false)

  const intents = stores.intents.list()
  assert.equal(intents.length, 2)
  assert.ok(intents.every((i) => i.source === 'manifest' && i.enabled))
  assert.equal(getSettings(stores).repoBudgetsUsd[repo], 5)
  cleanup()
})

test('re-adopt syncs: adds, updates, and removes manifest intents only', () => {
  const { repo, stores, cleanup } = world()
  putManifest(repo, GOOD)
  adoptManifest(stores, repo, BUILTINS)
  const human = stores.intents.insert({ projectPath: repo, builtin: 'backlog-triaged', label: 'mine', enabled: true })

  putManifest(repo, {
    version: 1,
    intents: [
      { builtin: 'tests-green', intervalMinutes: 240, autonomy: 'apply' }, // updated
      { builtin: 'deps-fresh' }, // added; text intent removed
    ],
  })
  adoptManifest(stores, repo, BUILTINS)

  const manifestIntents = stores.intents.list().filter((i) => i.source === 'manifest')
  assert.equal(manifestIntents.length, 2)
  const tests = manifestIntents.find((i) => i.builtin === 'tests-green')
  assert.equal(tests.intervalMinutes, 240)
  assert.equal(tests.autonomy, 'apply')
  assert.ok(manifestIntents.find((i) => i.builtin === 'deps-fresh'))
  assert.ok(stores.intents.get(human.id)) // human-created intent untouched
  cleanup()
})

test('a changed manifest pauses its intents and asks once for re-consent', () => {
  const { repo, stores, cleanup } = world()
  putManifest(repo, GOOD)
  adoptManifest(stores, repo, BUILTINS)

  putManifest(repo, { ...GOOD, intents: [{ builtin: 'tests-green' }] }) // edited after consent
  watchManifests(stores, BUILTINS)

  const intents = stores.intents.list().filter((i) => i.source === 'manifest')
  assert.ok(intents.every((i) => !i.enabled)) // paused until re-adopted
  const cards = stores.updates.list().filter((u) => u.title.startsWith('Manifest changed'))
  assert.equal(cards.length, 1)

  watchManifests(stores, BUILTINS) // same hash again: no duplicate card
  assert.equal(stores.updates.list().filter((u) => u.title.startsWith('Manifest changed')).length, 1)

  adoptManifest(stores, repo, BUILTINS) // re-consent re-enables
  assert.ok(stores.intents.list().filter((i) => i.source === 'manifest').every((i) => i.enabled))
  assert.equal(manifestStatus(stores, repo, BUILTINS).changed, false)
  cleanup()
})

test('drop removes manifest intents and consent, keeps human intents', () => {
  const { repo, stores, cleanup } = world()
  putManifest(repo, GOOD)
  adoptManifest(stores, repo, BUILTINS)
  const human = stores.intents.insert({ projectPath: repo, builtin: 'backlog-triaged', label: 'mine' })

  const status = dropManifest(stores, repo)
  assert.equal(status.adopted, false)
  assert.equal(stores.intents.list().filter((i) => i.source === 'manifest').length, 0)
  assert.ok(stores.intents.get(human.id))
  cleanup()
})

test('export writes a manifest that round-trips through adopt', () => {
  const { repo, stores, cleanup } = world()
  stores.intents.insert({
    projectPath: repo,
    builtin: 'tests-green',
    label: 'Tests always green',
    intervalMinutes: 90,
    autonomy: 'propose',
    enabled: true,
  })

  const file = writeManifest(stores, repo)
  assert.ok(existsSync(file))
  const written = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(written.version, 1)
  assert.equal(written.intents[0].builtin, 'tests-green')

  // Exporting implies consent to the exported content — no changed flag.
  const status = manifestStatus(stores, repo, BUILTINS)
  assert.equal(status.adopted, true)
  assert.equal(status.changed, false)
  cleanup()
})
