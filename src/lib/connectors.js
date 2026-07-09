import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
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

/**
 * Add an MCP server to the user-scope mcpServers in ~/.claude.json.
 * This is the ONE place Basecamp writes to Claude's config — the UI requires
 * explicit confirmation, and the first write creates a one-time backup at
 * .claude.json.basecamp-backup.
 */
export function addConnector(claudeDir, { name, transport, url, command, args }) {
  if (!name || !/^[\w-]+$/.test(name)) throw new Error('Connector name must be alphanumeric/dashes')
  if (transport === 'http' || transport === 'sse') {
    if (!url || !/^https?:\/\//.test(url)) throw new Error('A valid http(s) url is required')
  } else if (transport === 'stdio') {
    if (!command) throw new Error('A command is required for stdio connectors')
  } else {
    throw new Error('transport must be http, sse, or stdio')
  }

  const path = claudeJsonPath(claudeDir)
  const config = safeReadJson(path)
  if (!config) throw new Error(`Cannot read ${path}`)
  if (config.mcpServers?.[name]) throw new Error(`Connector "${name}" already exists`)

  const backup = `${path}.basecamp-backup`
  if (!existsSync(backup)) copyFileSync(path, backup)

  const server =
    transport === 'stdio'
      ? { type: 'stdio', command, args: args || [] }
      : { type: transport, url }
  const updated = { ...config, mcpServers: { ...(config.mcpServers || {}), [name]: server } }
  writeFileSync(path, JSON.stringify(updated, null, 2))
  return describeServer(name, server, 'user')
}

/** Remove a user-scope MCP server added in ~/.claude.json. */
export function removeConnector(claudeDir, name) {
  const path = claudeJsonPath(claudeDir)
  const config = safeReadJson(path)
  if (!config?.mcpServers?.[name]) throw new Error(`No user-scope connector named "${name}"`)
  const backup = `${path}.basecamp-backup`
  if (!existsSync(backup)) copyFileSync(path, backup)
  const { [name]: _removed, ...rest } = config.mcpServers
  writeFileSync(path, JSON.stringify({ ...config, mcpServers: rest }, null, 2))
  return true
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
