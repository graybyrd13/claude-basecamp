import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/lib/store.js'
import { nextRunTime, describeSchedule, fireDueRoutines } from '../src/lib/scheduler.js'

function tempStores() {
  const home = mkdtempSync(join(tmpdir(), 'basecamp-test-'))
  mkdirSync(join(home, 'logs'), { recursive: true })
  return {
    home,
    routines: new Store(home, 'routines'),
    runs: new Store(home, 'runs'),
    updates: new Store(home, 'updates'),
  }
}

test('Store insert/get/update/remove round-trips through disk', () => {
  const stores = tempStores()
  const record = stores.routines.insert({ name: 'test' })
  assert.ok(record.id)

  // A fresh Store instance must read the same data back from disk.
  const reloaded = new Store(stores.home, 'routines')
  assert.equal(reloaded.get(record.id).name, 'test')

  stores.routines.update(record.id, { name: 'renamed' })
  assert.equal(stores.routines.get(record.id).name, 'renamed')
  assert.equal(stores.routines.remove(record.id), true)
  assert.equal(stores.routines.get(record.id), null)
  rmSync(stores.home, { recursive: true, force: true })
})

test('nextRunTime computes interval schedules', () => {
  const from = Date.parse('2026-07-09T12:00:00Z')
  assert.equal(nextRunTime({ type: 'interval', minutes: 30 }, from), from + 30 * 60 * 1000)
  assert.equal(nextRunTime({ type: 'interval', minutes: 0 }, from), null)
  assert.equal(nextRunTime(null, from), null)
  assert.equal(nextRunTime({ type: 'bogus' }, from), null)
})

test('nextRunTime computes daily schedules strictly in the future', () => {
  const from = new Date(2026, 6, 9, 12, 0, 0).getTime() // local noon
  const next = nextRunTime({ type: 'daily', time: '09:00' }, from)
  const nextDate = new Date(next)
  assert.equal(nextDate.getHours(), 9)
  assert.ok(next > from)
  assert.ok(next - from <= 24 * 60 * 60 * 1000)
})

test('nextRunTime computes weekly schedules on the right day', () => {
  const from = new Date(2026, 6, 9, 12, 0, 0).getTime() // Thursday
  const next = nextRunTime({ type: 'weekly', day: 1, time: '08:30' }, from)
  const nextDate = new Date(next)
  assert.equal(nextDate.getDay(), 1) // Monday
  assert.equal(nextDate.getHours(), 8)
  assert.ok(next > from)
})

test('describeSchedule renders human labels', () => {
  assert.equal(describeSchedule({ type: 'interval', minutes: 90 }), 'every 90 min')
  assert.equal(describeSchedule({ type: 'daily', time: '09:00' }), 'daily at 09:00')
  assert.equal(describeSchedule({ type: 'weekly', day: 1, time: '08:00' }), 'Mondays at 08:00')
})

test('fireDueRoutines launches due routines and reschedules them', () => {
  const stores = tempStores()
  const now = Date.now()
  stores.routines.insert({
    name: 'due',
    projectPath: '/tmp',
    prompt: 'do work',
    schedule: { type: 'interval', minutes: 60 },
    permissionMode: 'plan',
    effort: 'xhigh',
    enabled: true,
    nextRun: now - 1000,
  })
  stores.routines.insert({
    name: 'not due',
    projectPath: '/tmp',
    prompt: 'later',
    schedule: { type: 'interval', minutes: 60 },
    enabled: true,
    nextRun: now + 60_000,
  })
  stores.routines.insert({
    name: 'disabled',
    projectPath: '/tmp',
    prompt: 'never',
    schedule: { type: 'interval', minutes: 60 },
    enabled: false,
    nextRun: now - 1000,
  })

  const launched = []
  const fakeLaunch = (_stores, options) => {
    launched.push(options)
    return { id: 'fake-run' }
  }
  const fired = fireDueRoutines(stores, now, fakeLaunch)

  assert.equal(fired.length, 1)
  assert.equal(launched[0].routineName, 'due')
  assert.equal(launched[0].permissionMode, 'plan')
  assert.equal(launched[0].effort, 'xhigh')
  const rescheduled = stores.routines.list().find((r) => r.name === 'due')
  assert.ok(rescheduled.nextRun > now)
  rmSync(stores.home, { recursive: true, force: true })
})
