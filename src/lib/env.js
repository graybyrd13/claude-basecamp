/**
 * Basecamp inherits its environment from wherever it was launched — often a
 * Claude Code session or a shell profile with stale ANTHROPIC_* overrides
 * (model pins, alternate base URLs, placeholder API keys). Any of these can
 * hijack or break child `claude` processes, so strip them and let Claude Code
 * use its own stored credentials. Set BASECAMP_KEEP_ENV=1 to opt out (e.g.
 * when you intentionally authenticate via ANTHROPIC_API_KEY).
 */
export function sanitizedEnv() {
  const env = { ...process.env }
  if (env.BASECAMP_KEEP_ENV === '1') return env
  for (const key of Object.keys(env)) {
    if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_')) delete env[key]
  }
  delete env.CLAUDECODE
  delete env.MAX_THINKING_TOKENS
  return env
}
