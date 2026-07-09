import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { claudeJsonPath } from './paths.js'

function safeReadJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function describeServer(name, config, scope) {
  return {
    name,
    scope,
    transport: config.type || (config.url ? 'http' : 'stdio'),
    command: config.command || null,
    url: config.url || null,
  }
}

/**
 * Collect MCP servers (connectors/extensions) from all config sources:
 * - Global: ~/.claude.json mcpServers
 * - Per-project: ~/.claude.json projects[path].mcpServers
 * - Settings: <claudeDir>/settings.json and settings.local.json
 */
export function listConnectors(claudeDir) {
  const connectors = []
  const seen = new Set()

  const add = (name, config, scope) => {
    const key = `${scope}:${name}`
    if (seen.has(key) || !config || typeof config !== 'object') return
    seen.add(key)
    connectors.push(describeServer(name, config, scope))
  }

  const claudeJson = safeReadJson(claudeJsonPath(claudeDir))
  if (claudeJson) {
    for (const [name, config] of Object.entries(claudeJson.mcpServers || {})) {
      add(name, config, 'user')
    }
    for (const [projectPath, project] of Object.entries(claudeJson.projects || {})) {
      for (const [name, config] of Object.entries(project?.mcpServers || {})) {
        add(name, config, `project:${projectPath}`)
      }
    }
  }

  for (const file of ['settings.json', 'settings.local.json']) {
    const settings = safeReadJson(join(claudeDir, file))
    for (const [name, config] of Object.entries(settings?.mcpServers || {})) {
      add(name, config, file)
    }
  }

  return connectors.sort((a, b) => a.name.localeCompare(b.name))
}

/** List installed plugins from <claudeDir>/plugins if present. */
export function listPlugins(claudeDir) {
  const pluginConfig = safeReadJson(join(claudeDir, 'plugin.json'))
  if (!pluginConfig) return []
  const plugins = []
  const repos = pluginConfig.repositories || pluginConfig.plugins || {}
  for (const [name, info] of Object.entries(repos)) {
    plugins.push({ name, enabled: info?.enabled !== false })
  }
  return plugins
}
