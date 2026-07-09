import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listConnectors } from './connectors.js'

const BUNDLED_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'catalog.json')
const REMOTE_URL =
  'https://raw.githubusercontent.com/graybyrd13/claude-basecamp/main/catalog.json'
const REMOTE_TIMEOUT_MS = 5000
const REMOTE_CACHE_TTL_MS = 10 * 60 * 1000

const MAX_SKILL_FILES = 60
const MAX_SKILL_BYTES = 5 * 1024 * 1024

// Only skills from repos on this list can be installed — the catalog is
// curated, but the remote fetch means entries must still be constrained.
const TRUSTED_SKILL_REPOS = new Set(['anthropics/skills', 'graybyrd13/claude-basecamp'])

let remoteCache = null

function validCatalog(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Array.isArray(data.connectors) &&
    Array.isArray(data.skills) &&
    data.connectors.every((c) => c.id && c.name && c.transport) &&
    data.skills.every((s) => s.id && s.name && s.repo && s.path)
  )
}

export function bundledCatalog() {
  return JSON.parse(readFileSync(BUNDLED_PATH, 'utf8'))
}

/**
 * The live catalog: fetched from the repo's main branch so new entries land
 * without a release, falling back to the bundled copy offline. Cached 10 min.
 */
export async function loadCatalog() {
  if (remoteCache && Date.now() - remoteCache.at < REMOTE_CACHE_TTL_MS) return remoteCache.data
  try {
    const res = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) })
    if (res.ok) {
      const data = await res.json()
      if (validCatalog(data)) {
        remoteCache = { at: Date.now(), data }
        return data
      }
    }
  } catch {
    /* offline or GitHub unavailable — bundled copy below */
  }
  const bundled = bundledCatalog()
  remoteCache = { at: Date.now(), data: bundled }
  return bundled
}

/** Catalog annotated with installed state for this machine. */
export async function catalogWithStatus(claudeDir) {
  const catalog = await loadCatalog()
  const installedConnectors = new Set(listConnectors(claudeDir).map((c) => c.name))
  return {
    connectors: catalog.connectors.map((c) => ({
      ...c,
      installed: installedConnectors.has(c.id),
    })),
    skills: catalog.skills.map((s) => ({
      ...s,
      installed: existsSync(join(claudeDir, 'skills', s.id)),
    })),
  }
}

async function githubJson(path) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'claude-basecamp' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    if (res.status === 403) throw new Error('GitHub API rate limit reached — try again in a few minutes')
    throw new Error(`GitHub API error ${res.status} for ${path}`)
  }
  return res.json()
}

/**
 * Install a skill by downloading its directory from a trusted GitHub repo
 * into <claudeDir>/skills/<id>. Uses the git tree API (one request) and
 * enforces file-count/size caps and path traversal guards.
 */
export async function installSkill(claudeDir, entry) {
  if (!/^[\w-]+$/.test(entry.id)) throw new Error('Invalid skill id')
  if (!TRUSTED_SKILL_REPOS.has(entry.repo)) {
    throw new Error(`Skill repo "${entry.repo}" is not on the trusted list`)
  }

  const repoMeta = await githubJson(`repos/${entry.repo}`)
  const tree = await githubJson(
    `repos/${entry.repo}/git/trees/${repoMeta.default_branch}?recursive=1`
  )
  const prefix = entry.path.replace(/\/+$/, '') + '/'
  const files = tree.tree.filter((n) => n.type === 'blob' && n.path.startsWith(prefix))
  if (files.length === 0) throw new Error(`No files found at ${entry.repo}/${entry.path}`)
  if (files.length > MAX_SKILL_FILES) throw new Error('Skill has too many files to auto-install')
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0)
  if (totalBytes > MAX_SKILL_BYTES) throw new Error('Skill is too large to auto-install')

  const targetRoot = join(claudeDir, 'skills', entry.id)
  const written = []
  for (const file of files) {
    const relative = file.path.slice(prefix.length)
    if (!relative || relative.split('/').some((seg) => seg === '..' || seg === '')) continue
    const target = join(targetRoot, relative)
    if (!target.startsWith(targetRoot)) continue
    const res = await fetch(
      `https://raw.githubusercontent.com/${entry.repo}/${repoMeta.default_branch}/${file.path}`,
      { signal: AbortSignal.timeout(20000) }
    )
    if (!res.ok) throw new Error(`Failed to download ${file.path} (${res.status})`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, Buffer.from(await res.arrayBuffer()))
    written.push(relative)
  }
  if (!written.includes('SKILL.md')) {
    rmSync(targetRoot, { recursive: true, force: true })
    throw new Error('Downloaded directory is not a valid skill (no SKILL.md)')
  }
  return { id: entry.id, files: written.length, path: targetRoot }
}

/** Remove a skill previously installed under <claudeDir>/skills/<id>. */
export function uninstallSkill(claudeDir, id) {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid skill id')
  const target = join(claudeDir, 'skills', id)
  if (!existsSync(target)) throw new Error(`Skill "${id}" is not installed`)
  rmSync(target, { recursive: true, force: true })
  return true
}

export const _internal = { validCatalog }
