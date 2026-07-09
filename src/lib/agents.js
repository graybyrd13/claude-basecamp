import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

/**
 * Parse simple YAML frontmatter from an agent definition file.
 * Handles the flat key: value format Claude Code agents use.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const fields = {}
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim()
    if (key && !key.startsWith(' ') && !key.startsWith('-')) fields[key] = value
  }
  return fields
}

/** List agent definitions from <claudeDir>/agents/*.md */
export function listAgents(claudeDir) {
  const agentsDir = join(claudeDir, 'agents')
  if (!existsSync(agentsDir)) return []
  const agents = []
  for (const file of readdirSync(agentsDir)) {
    if (!file.endsWith('.md')) continue
    let content
    try {
      content = readFileSync(join(agentsDir, file), 'utf8')
    } catch {
      continue
    }
    const fm = parseFrontmatter(content)
    agents.push({
      id: basename(file, '.md'),
      name: fm.name || basename(file, '.md'),
      description: fm.description || null,
      model: fm.model || null,
      tools: fm.tools ? fm.tools.split(',').map((t) => t.trim()) : null,
    })
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name))
}
