import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { renderLaunchdPlist, renderSystemdUnit, servicePaths, probeServer } from '../src/lib/daemon.js'

const OPTS = {
  nodePath: '/usr/local/bin/node',
  binPath: '/opt/claude-basecamp/bin/basecamp.js',
  port: 4747,
  pathEnv: '/usr/local/bin:/usr/bin:/bin',
}

test('launchd plist runs headless at login with a snapshotted PATH', () => {
  const plist = renderLaunchdPlist(OPTS)
  assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/)
  assert.match(plist, /<string>\/opt\/claude-basecamp\/bin\/basecamp\.js<\/string>/)
  assert.match(plist, /<string>--no-open<\/string>/)
  assert.match(plist, /<key>PATH<\/key><string>\/usr\/local\/bin:\/usr\/bin:\/bin<\/string>/)
  assert.match(plist, /<key>BASECAMP_PORT<\/key><string>4747<\/string>/)
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/)
})

test('launchd plist escapes XML-hostile paths', () => {
  const plist = renderLaunchdPlist({ ...OPTS, binPath: '/tmp/a&b<c>/basecamp.js' })
  assert.match(plist, /a&amp;b&lt;c&gt;/)
  assert.ok(!plist.includes('a&b<c>'))
})

test('systemd unit restarts on failure and carries the environment', () => {
  const unit = renderSystemdUnit(OPTS)
  assert.match(unit, /ExecStart=\/usr\/local\/bin\/node \/opt\/claude-basecamp\/bin\/basecamp\.js --no-open/)
  assert.match(unit, /Environment=PATH=\/usr\/local\/bin:\/usr\/bin:\/bin/)
  assert.match(unit, /Environment=BASECAMP_PORT=4747/)
  assert.match(unit, /Restart=on-failure/)
  assert.match(unit, /WantedBy=default\.target/)
})

test('servicePaths picks user-level locations per platform', () => {
  // join() uses the HOST separator, so these assertions must accept both —
  // the Windows CI leg runs this same darwin/linux shape check.
  const mac = servicePaths('darwin', '/Users/x')
  assert.equal(mac.kind, 'launchd')
  assert.match(mac.file, /Users[\\/]x[\\/]Library[\\/]LaunchAgents[\\/].*\.plist$/)

  const linux = servicePaths('linux', '/home/x')
  assert.equal(linux.kind, 'systemd')
  assert.match(linux.file, /home[\\/]x[\\/]\.config[\\/]systemd[\\/]user[\\/]claude-basecamp\.service$/)

  const windows = servicePaths('win32', 'C:\\Users\\x')
  assert.equal(windows.kind, 'schtasks')
  assert.equal(windows.taskName, 'claude-basecamp')

  // Defaults resolve against the real home dir without touching the system.
  assert.ok(servicePaths().file === null || servicePaths().file.startsWith(homedir()))
})

test('probeServer reports not-running without a server, quickly', async () => {
  const probe = await probeServer(1) // port 1: nothing listens there
  assert.equal(probe.running, false)
  assert.equal(probe.port, 1)
})
