import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Resolve the Claude data directory. Priority:
 * 1. Explicit --dir flag
 * 2. CLAUDE_CONFIG_DIR environment variable
 * 3. ~/.claude
 */
export function resolveClaudeDir(explicitDir) {
  const dir = explicitDir || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  if (!existsSync(dir)) {
    throw new Error(
      `Claude data directory not found: ${dir}\n` +
        'Run Claude Code at least once, or point at a directory with --dir <path>.'
    )
  }
  return dir
}

/** Path to the global claude.json (session/project registry lives next to the data dir). */
export function claudeJsonPath(claudeDir) {
  // ~/.claude.json sits beside ~/.claude by default; inside custom dirs it may be at the root
  const sibling = join(claudeDir, '..', '.claude.json')
  const inside = join(claudeDir, '.claude.json')
  if (existsSync(inside)) return inside
  return sibling
}

/**
 * Decode a Claude project directory name back to a filesystem path.
 * Claude encodes "/Users/gray/my-app" as "-Users-gray-my-app".
 * The encoding is lossy (both "/" and "-" become "-"), so this is best-effort.
 */
export function decodeProjectDirName(name) {
  return name.replace(/-/g, '/')
}
