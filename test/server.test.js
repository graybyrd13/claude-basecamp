import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'

const FIXTURE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claude-dir')

test('server serves dashboard and API endpoints', async (t) => {
  const { server, url } = await startServer({ port: 0, claudeDir: FIXTURE_DIR })
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => server.close())

  const index = await fetch(`${base}/`)
  assert.equal(index.status, 200)
  assert.match(await index.text(), /Claude Basecamp/)

  const overview = await (await fetch(`${base}/api/overview`)).json()
  assert.equal(overview.projectCount, 1)
  assert.equal(overview.sessionCount, 1)
  assert.equal(overview.agentCount, 1)

  const projects = await (await fetch(`${base}/api/projects`)).json()
  assert.equal(projects.length, 1)

  const usage = await (await fetch(`${base}/api/usage?days=36500`)).json()
  assert.equal(usage.totals.output, 650)

  const missing = await fetch(`${base}/api/session?project=x&id=y`)
  assert.equal(missing.status, 404)

  const badRequest = await fetch(`${base}/api/sessions`)
  assert.equal(badRequest.status, 400)

  const traversal = await fetch(`${base}/..%2f..%2fpackage.json`)
  assert.notEqual(traversal.status, 200)

  assert.ok(url.startsWith('http://127.0.0.1'))
})
