import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listAgents } from '../src/lib/agents.js'
import { listConnectors } from '../src/lib/connectors.js'

const FIXTURE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'claude-dir')

test('listAgents parses frontmatter fields', () => {
  const agents = listAgents(FIXTURE_DIR)
  assert.equal(agents.length, 1)
  assert.equal(agents[0].name, 'test-agent')
  assert.equal(agents[0].description, 'A fixture agent for tests')
  assert.equal(agents[0].model, 'haiku')
  assert.deepEqual(agents[0].tools, ['Read', 'Grep'])
})

test('listAgents returns empty array when agents dir is missing', () => {
  assert.deepEqual(listAgents('/nonexistent'), [])
})

test('listConnectors finds MCP servers in settings.json', () => {
  const connectors = listConnectors(FIXTURE_DIR)
  const gmail = connectors.find((c) => c.name === 'gmail')
  assert.ok(gmail)
  assert.equal(gmail.transport, 'http')
  assert.equal(gmail.url, 'https://example.com/gmail-mcp')
  assert.equal(gmail.scope, 'settings.json')
})
