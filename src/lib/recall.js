import { createReadStream, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { listProjects, listSessions, summarizeSession } from './sessions.js'
import { streamJsonl } from './jsonl.js'
import { decodeProjectDirName } from './paths.js'

/**
 * Recall: instant local search across every Claude session on this machine.
 *
 * A pure-JS inverted index over transcript text — user messages, assistant
 * replies, commands and file paths from tool calls. Built incrementally with
 * the same mtime discipline as the session cache, persisted compactly under
 * Basecamp's own home, never touching ~/.claude. First query kicks the build
 * and reports progress; afterwards a sweep is a pure fs-stat pass.
 */

const MIN_TOKEN = 2
const MAX_TOKEN = 40
const MAX_TOKENS_PER_SESSION = 6000
const MAX_FIELD_CHARS = 500
const SWEEP_INTERVAL_MS = 30 * 1000
const SNIPPET_RADIUS = 80
const HYDRATE_LIMIT = 8

/** Break text into searchable tokens: words, identifiers, filenames. */
export function tokenize(text) {
  const tokens = []
  const matches = String(text).toLowerCase().match(/[a-z0-9_$.-]+/g) || []
  for (let token of matches) {
    token = token.replace(/^[._-]+|[._-]+$/g, '')
    if (token.length < MIN_TOKEN || token.length > MAX_TOKEN) continue
    if (/^\d{9,}$/.test(token)) continue // timestamps, ids — noise
    tokens.push(token)
  }
  return tokens
}

/** The searchable strings inside one transcript entry. */
function textsOf(entry) {
  const texts = []
  if (entry.type === 'summary' && entry.summary) texts.push(entry.summary)
  const content = entry.message?.content
  if (typeof content === 'string') texts.push(content)
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'text' && part.text) texts.push(part.text)
      if (part?.type === 'tool_use' && part.input) {
        for (const field of ['command', 'file_path', 'prompt', 'description', 'pattern']) {
          if (typeof part.input[field] === 'string') texts.push(part.input[field].slice(0, MAX_FIELD_CHARS))
        }
      }
    }
  }
  return texts
}

async function tokenizeSession(filePath) {
  const tokens = new Set()
  try {
    await streamJsonl(filePath, (entry) => {
      if (tokens.size >= MAX_TOKENS_PER_SESSION) return
      for (const text of textsOf(entry)) {
        for (const token of tokenize(text)) {
          if (tokens.size >= MAX_TOKENS_PER_SESSION) break
          tokens.add(token)
        }
      }
    })
  } catch {
    /* unreadable transcript — index what we have */
  }
  return [...tokens]
}

/** First line in the transcript containing any query token, trimmed. */
async function snippetFor(filePath, tokens) {
  try {
    const stream = createReadStream(filePath, { encoding: 'utf8' })
    const closed = new Promise((resolve) => stream.once('close', resolve))
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    for await (const line of rl) {
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      for (const text of textsOf(entry)) {
        const lower = text.toLowerCase()
        for (const token of tokens) {
          const at = lower.indexOf(token)
          if (at === -1) continue
          const start = Math.max(0, at - SNIPPET_RADIUS)
          const clipped = text.slice(start, at + token.length + SNIPPET_RADIUS).replace(/\s+/g, ' ').trim()
          rl.close()
          stream.destroy()
          // Wait for the fd to actually close — Windows cannot delete a
          // transcript while an early-exited snippet read still holds it.
          await closed
          return (start > 0 ? '…' : '') + clipped
        }
      }
    }
  } catch {
    /* transcript vanished mid-search */
  }
  return null
}

export function createRecall(claudeDir, home) {
  const indexFile = join(home, 'recall-index.json')
  const files = new Map() // key -> { mtime, tokens: string[] }
  const postings = new Map() // token -> Set(key)
  let phase = 'cold' // cold | building | ready
  let progress = { done: 0, total: 0 }
  let lastSweep = 0
  let sweeping = null

  const keyOf = (projectId, sessionId) => `${projectId}/${sessionId}`

  function addPostings(key, tokens) {
    for (const token of tokens) {
      let set = postings.get(token)
      if (!set) postings.set(token, (set = new Set()))
      set.add(key)
    }
  }

  function removePostings(key) {
    const known = files.get(key)
    if (!known) return
    for (const token of known.tokens) {
      const set = postings.get(token)
      if (set) {
        set.delete(key)
        if (set.size === 0) postings.delete(token)
      }
    }
  }

  function loadPersisted() {
    if (!existsSync(indexFile)) return
    try {
      const parsed = JSON.parse(readFileSync(indexFile, 'utf8'))
      if (parsed.version !== 1 || !Array.isArray(parsed.files)) return
      for (const [key, mtime, tokens] of parsed.files) {
        files.set(key, { mtime, tokens })
        addPostings(key, tokens)
      }
    } catch {
      /* corrupt index — rebuild from scratch */
    }
  }

  function persist() {
    const payload = { version: 1, files: [...files.entries()].map(([k, v]) => [k, v.mtime, v.tokens]) }
    try {
      writeFileSync(`${indexFile}.tmp`, JSON.stringify(payload))
      renameSync(`${indexFile}.tmp`, indexFile)
    } catch {
      /* index is a cache — losing it only costs a rebuild */
    }
  }

  async function sweep() {
    const seen = new Set()
    const targets = []
    for (const project of listProjects(claudeDir)) {
      for (const session of listSessions(claudeDir, project.id)) {
        const key = keyOf(project.id, session.id)
        seen.add(key)
        const known = files.get(key)
        if (!known || known.mtime !== session.lastModified) {
          targets.push({ key, projectId: project.id, sessionId: session.id, mtime: session.lastModified })
        }
      }
    }
    for (const key of [...files.keys()]) {
      if (!seen.has(key)) {
        removePostings(key)
        files.delete(key)
      }
    }
    progress = { done: 0, total: targets.length }
    for (const target of targets) {
      const filePath = join(claudeDir, 'projects', target.projectId, `${target.sessionId}.jsonl`)
      const tokens = await tokenizeSession(filePath)
      removePostings(target.key)
      files.set(target.key, { mtime: target.mtime, tokens })
      addPostings(target.key, tokens)
      progress.done++
    }
    if (targets.length) persist()
  }

  /** Bring the index up to date. `force` skips the sweep throttle. */
  async function ready(force = false) {
    if (phase === 'building') return sweeping
    if (phase === 'cold') {
      phase = 'building'
      sweeping = (async () => {
        loadPersisted()
        await sweep()
        phase = 'ready'
        lastSweep = Date.now()
      })()
      return sweeping
    }
    if (force || Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
      lastSweep = Date.now()
      sweeping = sweep()
      await sweeping
    }
  }

  async function search(query, limit = 10) {
    const tokens = [...new Set(tokenize(query))]
    if (!tokens.length) return { building: phase !== 'ready', progress, results: [] }

    if (phase !== 'ready') {
      ready() // kick the build; report progress instead of blocking
      return { building: true, progress, results: [] }
    }
    await ready() // throttled freshness sweep

    // Every full token must match; the last one may match as a prefix —
    // that is what makes typing feel like typeahead.
    const last = tokens[tokens.length - 1]
    const sets = tokens.slice(0, -1).map((token) => postings.get(token) || new Set())
    const lastSet = new Set(postings.get(last) || [])
    for (const [token, set] of postings) {
      if (token.startsWith(last)) for (const key of set) lastSet.add(key)
    }
    sets.push(lastSet)

    sets.sort((a, b) => a.size - b.size)
    let matched = [...sets[0]]
    for (const set of sets.slice(1)) matched = matched.filter((key) => set.has(key))

    matched.sort((a, b) => (files.get(b)?.mtime || 0) - (files.get(a)?.mtime || 0))
    const top = matched.slice(0, limit)

    const results = []
    for (const key of top) {
      const slash = key.indexOf('/')
      const projectId = key.slice(0, slash)
      const sessionId = key.slice(slash + 1)
      const result = {
        projectId,
        sessionId,
        path: decodeProjectDirName(projectId),
        lastModified: files.get(key)?.mtime || 0,
        title: null,
        snippet: null,
      }
      if (results.length < HYDRATE_LIMIT) {
        const filePath = join(claudeDir, 'projects', projectId, `${sessionId}.jsonl`)
        const summary = await summarizeSession(claudeDir, projectId, sessionId).catch(() => null)
        result.title = summary?.title || null
        result.snippet = await snippetFor(filePath, tokens)
      }
      results.push(result)
    }
    return { building: false, progress, results }
  }

  return { search, ready, status: () => ({ phase, progress, sessions: files.size }) }
}
