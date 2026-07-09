import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_LIST_LENGTH = 300

/** Resolve Basecamp's own data directory (routines, runs, updates). */
export function resolveBasecampHome() {
  const dir = process.env.BASECAMP_HOME || join(homedir(), '.claude-basecamp')
  mkdirSync(join(dir, 'logs'), { recursive: true })
  return dir
}

/**
 * Tiny JSON-file collection store. Each collection is one file:
 * <home>/<name>.json holding an array of records with `id` fields.
 * Writes are temp-file + rename so a crash can't corrupt data.
 */
export class Store {
  constructor(home, name) {
    this.file = join(home, `${name}.json`)
    this.records = this.#load()
  }

  #load() {
    if (!existsSync(this.file)) return []
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  #save() {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.records, null, 2))
    renameSync(tmp, this.file)
  }

  list() {
    return [...this.records]
  }

  get(id) {
    return this.records.find((r) => r.id === id) || null
  }

  insert(fields) {
    const record = { id: randomUUID(), createdAt: Date.now(), ...fields }
    this.records = [record, ...this.records].slice(0, MAX_LIST_LENGTH)
    this.#save()
    return record
  }

  update(id, fields) {
    const index = this.records.findIndex((r) => r.id === id)
    if (index === -1) return null
    const updated = { ...this.records[index], ...fields, id }
    this.records = this.records.map((r, i) => (i === index ? updated : r))
    this.#save()
    return updated
  }

  remove(id) {
    const before = this.records.length
    this.records = this.records.filter((r) => r.id !== id)
    if (this.records.length === before) return false
    this.#save()
    return true
  }
}

export function openStores(home = resolveBasecampHome()) {
  return {
    home,
    routines: new Store(home, 'routines'),
    runs: new Store(home, 'runs'),
    updates: new Store(home, 'updates'),
    goals: new Store(home, 'goals'),
    managers: new Store(home, 'managers'),
    messages: new Store(home, 'messages'),
  }
}
