import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const HOOK_MARKER = 'basecamp-reflex'

function hookCommand(port) {
  // Consults the daemon before every mutating tool call, machine-wide.
  // -m 2: if Basecamp is down the hook fails fast; a non-2 exit is
  // non-blocking in Claude Code, so sessions work normally without the daemon.
  return `curl -s -m 2 -X POST http://127.0.0.1:${port}/api/reflex/hook -H 'Content-Type: application/json' --data-binary @- # ${HOOK_MARKER}`
}

function settingsPath(claudeDir) {
  return join(claudeDir, 'settings.json')
}

function readSettings(claudeDir) {
  const path = settingsPath(claudeDir)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`Cannot parse ${path} — fix it manually before installing the reflex hook`)
  }
}

export function reflexHookInstalled(claudeDir) {
  try {
    const settings = readSettings(claudeDir)
    return JSON.stringify(settings.hooks?.PreToolUse || []).includes(HOOK_MARKER)
  } catch {
    return false
  }
}

/**
 * Install the PreToolUse reflex hook into ~/.claude/settings.json.
 * Explicit opt-in write, mirrored on the connector-install pattern:
 * one-time backup, additive change only, removable with uninstall.
 */
export function installReflexHook(claudeDir, port) {
  const path = settingsPath(claudeDir)
  const settings = readSettings(claudeDir)
  if (reflexHookInstalled(claudeDir)) return { installed: true, already: true }

  const backup = `${path}.basecamp-backup`
  if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup)

  const entry = {
    matcher: 'Bash|Write|Edit|MultiEdit',
    hooks: [{ type: 'command', command: hookCommand(port), timeout: 5 }],
  }
  const updated = {
    ...settings,
    hooks: {
      ...(settings.hooks || {}),
      PreToolUse: [...(settings.hooks?.PreToolUse || []), entry],
    },
  }
  writeFileSync(path, JSON.stringify(updated, null, 2))
  return { installed: true, already: false }
}

export function uninstallReflexHook(claudeDir) {
  const path = settingsPath(claudeDir)
  const settings = readSettings(claudeDir)
  const hooks = settings.hooks?.PreToolUse || []
  const filtered = hooks.filter((h) => !JSON.stringify(h).includes(HOOK_MARKER))
  if (filtered.length === hooks.length) return { installed: false }
  writeFileSync(
    path,
    JSON.stringify({ ...settings, hooks: { ...settings.hooks, PreToolUse: filtered } }, null, 2)
  )
  return { installed: false }
}
