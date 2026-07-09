#!/usr/bin/env node
import { startServer } from '../src/server.js'
import { resolveClaudeDir } from '../src/lib/paths.js'
import { spawn } from 'node:child_process'

const HELP = `claude-basecamp — a manager for every project

Usage:
  claude-basecamp [options]     Start the dashboard
  claude-basecamp mcp           Run as an MCP server (proxies to a running dashboard)

Options:
  --port <n>     Port to listen on (default: 4747, env: BASECAMP_PORT)
  --dir <path>   Claude data directory (default: ~/.claude, env: CLAUDE_CONFIG_DIR)
  --no-open      Don't open the browser automatically
  --help         Show this help
`

function parseArgs(argv) {
  const args = { port: Number(process.env.BASECAMP_PORT) || 4747, dir: null, open: true }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(HELP)
      process.exit(0)
    } else if (arg === '--port') {
      args.port = Number(argv[++i])
      if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
        console.error('Invalid --port value')
        process.exit(1)
      }
    } else if (arg === '--dir') {
      args.dir = argv[++i]
    } else if (arg === '--no-open') {
      args.open = false
    } else {
      console.error(`Unknown option: ${arg}\n`)
      console.log(HELP)
      process.exit(1)
    }
  }
  return args
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(cmd, [url], { shell: process.platform === 'win32', stdio: 'ignore', detached: true }).on(
    'error',
    () => {}
  )
}

if (process.argv[2] === 'mcp') {
  const { startMcpServer } = await import('../src/mcp-server.js')
  startMcpServer()
} else {
  runDashboard()
}

function runDashboard() {
const args = parseArgs(process.argv.slice(2))
const claudeDir = resolveClaudeDir(args.dir)

startServer({ port: args.port, claudeDir })
  .then(({ url }) => {
    console.log(`\n  ⛺ Claude Basecamp running at ${url}`)
    console.log(`     Data directory: ${claudeDir}\n`)
    if (args.open) openBrowser(url)
  })
  .catch((err) => {
    console.error(`Failed to start: ${err.message}`)
    process.exit(1)
  })
}
