import { execFile } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/**
 * Always On: run Basecamp as a user-level login service, so the reconciler,
 * scheduler, and reflex hook endpoint are alive without a terminal open.
 *
 * Everything is explicit opt-in (`claude-basecamp daemon install`), writes
 * only user-level service files, and uninstalls cleanly. The scheduler and
 * reconciler already catch up after sleep — due work fires on the next tick.
 */

const SERVICE_NAME = 'com.claude-basecamp.dashboard'
const BIN_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'bin', 'basecamp.js')

export function servicePaths(platform = process.platform, home = homedir()) {
  if (platform === 'darwin') return { kind: 'launchd', file: join(home, 'Library', 'LaunchAgents', `${SERVICE_NAME}.plist`) }
  if (platform === 'win32') return { kind: 'schtasks', file: null, taskName: 'claude-basecamp' }
  return { kind: 'systemd', file: join(home, '.config', 'systemd', 'user', 'claude-basecamp.service') }
}

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * launchd jobs get a minimal PATH; the daemon must still find `claude` (and
 * whatever node manager the user runs), so the install snapshots PATH.
 */
export function renderLaunchdPlist({ nodePath, binPath, port, pathEnv }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(binPath)}</string>
    <string>--no-open</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xmlEscape(pathEnv)}</string>
    <key>BASECAMP_PORT</key><string>${Number(port) || 4747}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
</dict>
</plist>
`
}

export function renderSystemdUnit({ nodePath, binPath, port, pathEnv }) {
  return `[Unit]
Description=Claude Basecamp dashboard and reconciler

[Service]
ExecStart=${nodePath} ${binPath} --no-open
Environment=PATH=${pathEnv}
Environment=BASECAMP_PORT=${Number(port) || 4747}
Restart=on-failure

[Install]
WantedBy=default.target
`
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || err?.message || '').trim() })
    )
  })
}

/** Install and start the login service. Explicit opt-in; user-level only. */
export async function installDaemon({ port = 4747, platform = process.platform } = {}) {
  const paths = servicePaths(platform)
  const opts = { nodePath: process.execPath, binPath: BIN_PATH, port, pathEnv: process.env.PATH || '' }

  if (paths.kind === 'launchd') {
    mkdirSync(dirname(paths.file), { recursive: true })
    writeFileSync(paths.file, renderLaunchdPlist(opts))
    await run('launchctl', ['unload', paths.file]) // reload cleanly if already installed
    const loaded = await run('launchctl', ['load', '-w', paths.file])
    if (!loaded.ok) throw new Error(`launchctl load failed: ${loaded.err}`)
    return { platform: 'macOS', file: paths.file, command: `${opts.nodePath} ${opts.binPath} --no-open` }
  }

  if (paths.kind === 'systemd') {
    mkdirSync(dirname(paths.file), { recursive: true })
    writeFileSync(paths.file, renderSystemdUnit(opts))
    await run('systemctl', ['--user', 'daemon-reload'])
    const enabled = await run('systemctl', ['--user', 'enable', '--now', 'claude-basecamp.service'])
    if (!enabled.ok) throw new Error(`systemctl enable failed: ${enabled.err}`)
    return { platform: 'Linux', file: paths.file, command: `${opts.nodePath} ${opts.binPath} --no-open` }
  }

  const command = `"${opts.nodePath}" "${opts.binPath}" --no-open`
  const created = await run('schtasks', [
    '/Create', '/F', '/SC', 'ONLOGON', '/TN', paths.taskName, '/TR', command,
  ])
  if (!created.ok) throw new Error(`schtasks create failed: ${created.err}`)
  await run('schtasks', ['/Run', '/TN', paths.taskName])
  return { platform: 'Windows', file: `Task Scheduler: ${paths.taskName}`, command }
}

/** Stop and remove the login service. */
export async function uninstallDaemon({ platform = process.platform } = {}) {
  const paths = servicePaths(platform)
  if (paths.kind === 'launchd') {
    if (existsSync(paths.file)) {
      await run('launchctl', ['unload', '-w', paths.file])
      rmSync(paths.file, { force: true })
    }
    return { removed: paths.file }
  }
  if (paths.kind === 'systemd') {
    await run('systemctl', ['--user', 'disable', '--now', 'claude-basecamp.service'])
    if (existsSync(paths.file)) rmSync(paths.file, { force: true })
    await run('systemctl', ['--user', 'daemon-reload'])
    return { removed: paths.file }
  }
  await run('schtasks', ['/End', '/TN', paths.taskName])
  await run('schtasks', ['/Delete', '/F', '/TN', paths.taskName])
  return { removed: `Task Scheduler: ${paths.taskName}` }
}

export function daemonInstalled(platform = process.platform) {
  const paths = servicePaths(platform)
  if (paths.kind === 'schtasks') return null // needs an async schtasks query; CLI reports separately
  return existsSync(paths.file)
}

/** Is a Basecamp server answering on this port? */
export async function probeServer(port = Number(process.env.BASECAMP_PORT) || 4747) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const res = await fetch(`http://127.0.0.1:${port}/api/overview`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { running: false, port }
    const overview = await res.json()
    return { running: true, port, projectCount: overview.projectCount, runningTasks: overview.runningTasks }
  } catch {
    return { running: false, port }
  }
}
