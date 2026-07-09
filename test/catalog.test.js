import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundledCatalog, uninstallSkill, installSkill, _internal } from '../src/lib/catalog.js'

test('bundled catalog is valid and every entry is well-formed', () => {
  const catalog = bundledCatalog()
  assert.ok(_internal.validCatalog(catalog))
  assert.ok(catalog.connectors.length >= 5)
  assert.ok(catalog.skills.length >= 5)
  for (const c of catalog.connectors) {
    assert.match(c.id, /^[\w-]+$/, `connector id ${c.id}`)
    if (c.transport === 'stdio') assert.ok(c.command, `${c.id} needs command`)
    else assert.match(c.url, /^https:\/\//, `${c.id} needs https url`)
  }
  for (const s of catalog.skills) {
    assert.match(s.id, /^[\w-]+$/, `skill id ${s.id}`)
    assert.ok(s.repo.includes('/'), `${s.id} repo`)
  }
})

test('validCatalog rejects malformed catalogs', () => {
  assert.equal(_internal.validCatalog(null), false)
  assert.equal(_internal.validCatalog({ connectors: [], skills: [{}] }), false)
  assert.equal(_internal.validCatalog({ connectors: 'nope', skills: [] }), false)
})

test('installSkill refuses untrusted repos and bad ids', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-catalog-'))
  await assert.rejects(
    installSkill(dir, { id: 'x', repo: 'evil/repo', path: 'skills/x' }),
    /trusted/
  )
  await assert.rejects(
    installSkill(dir, { id: '../escape', repo: 'anthropics/skills', path: 'skills/x' }),
    /Invalid skill id/
  )
  rmSync(dir, { recursive: true, force: true })
})

test('uninstallSkill removes an installed skill and guards ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'basecamp-catalog-'))
  const skillDir = join(dir, 'skills', 'demo')
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: demo\n---\n')

  assert.equal(uninstallSkill(dir, 'demo'), true)
  assert.equal(existsSync(skillDir), false)
  assert.throws(() => uninstallSkill(dir, 'demo'), /not installed/)
  assert.throws(() => uninstallSkill(dir, '../../etc'), /Invalid skill id/)
  rmSync(dir, { recursive: true, force: true })
})
