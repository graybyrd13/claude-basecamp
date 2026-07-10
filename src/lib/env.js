/**
 * Basecamp inherits its environment from wherever it was launched — often a
 * Claude Code session or a shell profile with stale ANTHROPIC_* overrides
 * (model pins, alternate base URLs, placeholder API keys). Any of these can
 * hijack or break child `claude` processes, so strip them and let Claude Code
 * use its own stored credentials.
 *
 * The one thing we keep is a genuine Anthropic API key (`sk-ant-…`): for a
 * user who authenticates by key rather than login, that IS their credential —
 * stripping it leaves `claude` with nothing and every turn 401s. Placeholder
 * and third-party keys (OpenRouter `sk-or-…`, literal placeholders, etc.) do
 * not match the prefix, so a stale export still can't hijack a logged-in user.
 * Note a real key is preserved even as the surrounding overrides (base URL,
 * auth token, model pins) are stripped, so the key always talks to the real
 * Anthropic API.
 *
 * Set BASECAMP_KEEP_ENV=1 to pass the environment through untouched (e.g. to
 * use a custom base URL, Bedrock/Vertex, or a non-`sk-ant-` key on purpose).
 */
const ANTHROPIC_API_KEY_PREFIX = 'sk-ant-'

export function sanitizedEnv() {
  const env = { ...process.env }
  if (env.BASECAMP_KEEP_ENV === '1') return env
  const apiKey = env.ANTHROPIC_API_KEY
  const keepApiKey = typeof apiKey === 'string' && apiKey.startsWith(ANTHROPIC_API_KEY_PREFIX)
  for (const key of Object.keys(env)) {
    if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_')) delete env[key]
  }
  delete env.CLAUDECODE
  delete env.MAX_THINKING_TOKENS
  if (keepApiKey) env.ANTHROPIC_API_KEY = apiKey
  return env
}
