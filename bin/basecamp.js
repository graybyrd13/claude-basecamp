#!/usr/bin/env node
import { startServer } from '../src/server.js'
import { resolveClaudeDir } from '../src/lib/paths.js'
import { spawn } from 'node:child_process'

const HELP = `claude-basecamp — a manager for every project

Usage:
  claude-basecamp [options]         Start the dashboard
  claude-basecamp mcp               Run as an MCP server (proxies to a running dashboard)
  claude-basecamp status            Is the dashboard running? Is the daemon installed?
  claude-basecamp daemon install    Run Basecamp at login (user-level service, no terminal needed)
  claude-basecamp daemon uninstall  Stop and remove the login service
  claude-basecamp daemon status     Same as status

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
  if (process.platform === 'win32') {
    // `start` is a cmd.exe builtin, not an executable on PATH, so it needs a
    // shell. It also needs an explicit empty title argument — without one,
    // `start <url>` can be parsed as `start "<url>"` with the url treated as
    // a window title instead of the thing to open.
    spawn('cmd', ['/c', 'start', '""', url], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    }).on('error', () => {})
    return
  }
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).on('error', () => {})
}

if (process.argv[2] === 'mcp') {
  const { startMcpServer } = await import('../src/mcp-server.js')
  startMcpServer()
} else if (process.argv[2] === 'daemon' || process.argv[2] === 'status') {
  await runDaemonCommand(process.argv[2] === 'status' ? 'status' : process.argv[3])
} else {
  runDashboard()
}

async function runDaemonCommand(action) {
  const { installDaemon, uninstallDaemon, daemonInstalled, probeServer } = await import('../src/lib/daemon.js')
  if (action === 'install') {
    const port = Number(process.env.BASECAMP_PORT) || 4747
    const result = await installDaemon({ port })
    console.log(`\n  Basecamp will now run at login (${result.platform}).`)
    console.log(`  Service: ${result.file}`)
    console.log(`  Command: ${result.command}`)
    console.log(`  Dashboard: http://localhost:${port}\n`)
    console.log(`  Note: if you usually run via npx, install globally first (npm i -g claude-basecamp)`)
    console.log(`  so the service survives npx cache cleanup.\n`)
    return
  }
  if (action === 'uninstall') {
    const result = await uninstallDaemon()
    console.log(`\n  Login service removed: ${result.removed}\n`)
    return
  }
  if (action === 'status' || !action) {
    const probe = await probeServer()
    const installed = daemonInstalled()
    console.log(`\n  Dashboard: ${probe.running ? `running on http://localhost:${probe.port} (${probe.runningTasks} active run${probe.runningTasks === 1 ? '' : 's'})` : `not running (port ${probe.port})`}`)
    console.log(`  Login service: ${installed === null ? 'check Task Scheduler for "claude-basecamp"' : installed ? 'installed' : 'not installed'}\n`)
    return
  }
  console.error(`Unknown daemon action: ${action}\n`)
  console.log(HELP)
  process.exit(1)
}

function runDashboard() {
const args = parseArgs(process.argv.slice(2))
const claudeDir = resolveClaudeDir(args.dir)

startServer({ port: args.port, claudeDir })
  .then(({ url }) => {
    console.log(`\n  Claude Basecamp running at ${url}`)
    console.log(`     Data directory: ${claudeDir}\n`)
    if (args.open) openBrowser(url)
  })
  .catch((err) => {
    console.error(`Failed to start: ${err.message}`)
    process.exit(1)
  })
}
