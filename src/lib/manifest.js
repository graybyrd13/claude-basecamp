import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { getSettings, updateSettings } from './settings.js'

/**
 * Manifests: intents-as-code. A repo declares its standing checks in a
 * versioned `.basecamp/manifest.json`; Basecamp materializes them as store
 * intents once the human adopts the manifest.
 *
 * Adoption is explicit and pinned to a content hash — a cloned repository
 * must never be able to start convergence runs (arbitrary prompts, real
 * tool access) just by containing a file. When an adopted manifest changes,
 * its intents pause until the human reviews and re-adopts.
 */

export const MANIFEST_RELPATH = join('.basecamp', 'manifest.json')
const MAX_INTENTS = 20
const MIN_INTERVAL_MINUTES = 15

export const manifestPath = (repoPath) => join(repoPath, MANIFEST_RELPATH)

export const manifestHash = (raw) => createHash('sha256').update(raw).digest('hex').slice(0, 16)

/** Stable identity for a manifest intent across edits of unrelated fields. */
export const manifestKeyFor = (entry) =>
  entry.builtin ? `builtin:${entry.builtin}` : `text:${createHash('sha256').update(entry.text).digest('hex').slice(0, 12)}`

/** Parse and validate a repo's manifest. null = no manifest; {error} = bad one. */
export function readManifest(repoPath, builtins) {
  const file = manifestPath(repoPath)
  if (!existsSync(file)) return null
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return { error: 'Manifest exists but could not be read' }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Manifest is not valid JSON' }
  }
  if (parsed.version !== 1) return { error: `Unsupported manifest version: ${parsed.version}` }
  if (!Array.isArray(parsed.intents) || parsed.intents.length === 0) {
    return { error: 'Manifest must declare an intents array' }
  }
  if (parsed.intents.length > MAX_INTENTS) return { error: `Too many intents (max ${MAX_INTENTS})` }

  const intents = []
  for (const entry of parsed.intents) {
    const builtin = entry.builtin || null
    const text = typeof entry.text === 'string' ? entry.text.trim() : null
    if (builtin && !builtins[builtin]) return { error: `Unknown builtin: ${builtin}` }
    if (!builtin && !text) return { error: 'Each intent needs a builtin or text' }
    if (text && text.length > 500) return { error: 'Intent text too long (max 500 chars)' }
    const autonomy = entry.autonomy || 'propose'
    if (!['propose', 'apply'].includes(autonomy)) return { error: `Invalid autonomy: ${entry.autonomy}` }
    intents.push({
      builtin,
      text: builtin ? null : text,
      autonomy,
      intervalMinutes: Math.max(Number(entry.intervalMinutes) || 120, MIN_INTERVAL_MINUTES),
      key: manifestKeyFor({ builtin, text }),
    })
  }

  const budgetUsd = parsed.budgetUsd != null ? Number(parsed.budgetUsd) : null
  if (budgetUsd != null && (!Number.isFinite(budgetUsd) || budgetUsd < 0)) {
    return { error: 'budgetUsd must be a non-negative number' }
  }

  return { version: 1, intents, budgetUsd, hash: manifestHash(raw) }
}

const consentFor = (stores, repoPath) =>
  stores.manifests.list().find((m) => m.repoPath === repoPath) || null

/**
 * Where a repo stands: no manifest, manifest awaiting adoption, adopted and
 * current, or adopted but changed (re-consent required).
 */
export function manifestStatus(stores, repoPath, builtins) {
  const manifest = readManifest(repoPath, builtins)
  const consent = consentFor(stores, repoPath)
  if (!manifest) {
    return { present: false, adopted: Boolean(consent), changed: false, error: null, manifest: null }
  }
  if (manifest.error) {
    return { present: true, adopted: Boolean(consent), changed: false, error: manifest.error, manifest: null }
  }
  return {
    present: true,
    adopted: Boolean(consent),
    changed: Boolean(consent) && consent.hash !== manifest.hash,
    error: null,
    manifest,
  }
}

/**
 * Adopt (or re-adopt) a repo's manifest: materialize its intents in the
 * store, apply its budget, and pin consent to the manifest's current hash.
 * Sync semantics: new entries appear, existing ones update in place
 * (interval/autonomy), removed ones leave the store. Human-created intents
 * are never touched.
 */
export function adoptManifest(stores, repoPath, builtins) {
  const manifest = readManifest(repoPath, builtins)
  if (!manifest) throw new Error('No manifest to adopt')
  if (manifest.error) throw new Error(manifest.error)

  const existing = stores.intents.list().filter((i) => i.projectPath === repoPath && i.source === 'manifest')
  const byKey = new Map(existing.map((i) => [i.manifestKey, i]))
  const seen = new Set()

  for (const entry of manifest.intents) {
    seen.add(entry.key)
    const current = byKey.get(entry.key)
    if (current) {
      stores.intents.update(current.id, {
        intervalMinutes: entry.intervalMinutes,
        autonomy: entry.autonomy,
        enabled: true,
      })
      continue
    }
    stores.intents.insert({
      projectPath: repoPath,
      builtin: entry.builtin,
      text: entry.text,
      label: entry.builtin ? builtins[entry.builtin].label : entry.text.slice(0, 80),
      intervalMinutes: entry.intervalMinutes,
      autonomy: entry.autonomy,
      model: null,
      enabled: true,
      source: 'manifest',
      manifestKey: entry.key,
      lastCheck: null,
      lastStatus: null,
      lastDetail: null,
      lastRunId: null,
      failStreak: 0,
    })
  }
  for (const intent of existing) {
    if (!seen.has(intent.manifestKey)) stores.intents.remove(intent.id)
  }

  if (manifest.budgetUsd != null) {
    const settings = getSettings(stores)
    updateSettings(stores, {
      repoBudgetsUsd: { ...settings.repoBudgetsUsd, [repoPath]: manifest.budgetUsd },
    })
  }

  const consent = consentFor(stores, repoPath)
  if (consent) stores.manifests.update(consent.id, { hash: manifest.hash, adoptedAt: Date.now() })
  else stores.manifests.insert({ repoPath, hash: manifest.hash, adoptedAt: Date.now() })

  return manifestStatus(stores, repoPath, builtins)
}

/** Withdraw consent: manifest-sourced intents leave the store. */
export function dropManifest(stores, repoPath) {
  for (const intent of stores.intents.list()) {
    if (intent.projectPath === repoPath && intent.source === 'manifest') stores.intents.remove(intent.id)
  }
  const consent = consentFor(stores, repoPath)
  if (consent) stores.manifests.remove(consent.id)
  return { present: existsSync(manifestPath(repoPath)), adopted: false }
}

/**
 * Export a repo's current checks as its manifest — the share flow. Writes
 * into the user's own repo on their explicit request.
 */
export function writeManifest(stores, repoPath) {
  const intents = stores.intents.list().filter((i) => i.projectPath === repoPath)
  if (!intents.length) throw new Error('No checks on this repository to export')
  const settings = getSettings(stores)
  const budgetUsd = Number(settings.repoBudgetsUsd?.[repoPath]) || undefined
  const manifest = {
    version: 1,
    intents: intents.map((i) => ({
      ...(i.builtin ? { builtin: i.builtin } : { text: i.text }),
      intervalMinutes: i.intervalMinutes,
      autonomy: i.autonomy || 'propose',
    })),
    ...(budgetUsd ? { budgetUsd } : {}),
  }
  const file = manifestPath(repoPath)
  mkdirSync(dirname(file), { recursive: true })
  const raw = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(file, raw)

  // Exporting implies consent to what was just written.
  const consent = consentFor(stores, repoPath)
  const hash = manifestHash(raw)
  if (consent) stores.manifests.update(consent.id, { hash, adoptedAt: Date.now() })
  else stores.manifests.insert({ repoPath, hash, adoptedAt: Date.now() })
  for (const intent of intents) {
    if (intent.source !== 'manifest') {
      stores.intents.update(intent.id, { source: 'manifest', manifestKey: manifestKeyFor(intent) })
    }
  }
  return file
}

/**
 * Watch adopted manifests for drift from their consented hash. A changed
 * manifest pauses its intents (they may now say something else entirely)
 * and raises one card per hash asking the human to review and re-adopt.
 */
export function watchManifests(stores, builtins) {
  for (const consent of stores.manifests.list()) {
    if (!existsSync(consent.repoPath)) continue
    const manifest = readManifest(consent.repoPath, builtins)
    if (!manifest) continue
    const currentHash = manifest.error ? `error:${manifest.error}` : manifest.hash
    if (currentHash === consent.hash || consent.notifiedHash === currentHash) continue

    for (const intent of stores.intents.list()) {
      if (intent.projectPath === consent.repoPath && intent.source === 'manifest') {
        stores.intents.update(intent.id, { enabled: false })
      }
    }
    stores.updates.insert({
      kind: 'decision-needed',
      projectPath: consent.repoPath,
      title: `Manifest changed in ${consent.repoPath.split(/[\\/]/).pop()}`,
      body: manifest.error
        ? `The manifest is now invalid (${manifest.error}). Its checks are paused until it is fixed and re-adopted.`
        : 'The repository manifest no longer matches what you adopted. Its checks are paused until you review and re-adopt it.',
    })
    stores.manifests.update(consent.id, { notifiedHash: currentHash })
  }
}
