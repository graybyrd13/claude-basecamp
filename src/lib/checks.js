import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { sanitizedEnv } from './env.js'

const TEST_TIMEOUT_MS = 5 * 60 * 1000
const CMD_TIMEOUT_MS = 60 * 1000
const OUTPUT_TAIL_CHARS = 1500

/**
 * Deterministic, local, zero-token drift checks. The reconciler prefers these
 * over model calls: a failing test suite is a fact, not an opinion.
 */

export function detectTestCommand(repoPath) {
  const pkgPath = join(repoPath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      const script = pkg.scripts?.test
      if (script && !/no test specified/i.test(script)) return { cmd: 'npm', args: ['test'] }
    } catch {
      /* unparseable package.json — fall through to other ecosystems */
    }
  }
  if (existsSync(join(repoPath, 'Cargo.toml'))) return { cmd: 'cargo', args: ['test'] }
  if (existsSync(join(repoPath, 'go.mod'))) return { cmd: 'go', args: ['test', './...'] }
  if (existsSync(join(repoPath, 'pytest.ini')) || existsSync(join(repoPath, 'setup.py'))) {
    return { cmd: 'pytest', args: [] }
  }
  return null
}

export function runCommand(repoPath, cmd, args, timeout = CMD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: repoPath,
        timeout,
        encoding: 'utf8',
        env: sanitizedEnv(),
        maxBuffer: 8 * 1024 * 1024,
        shell: process.platform === 'win32',
      },
      (err, stdout, stderr) => {
        const output = `${stdout || ''}\n${stderr || ''}`.trim()
        resolve({
          ok: !err,
          code: err ? err.code ?? 1 : 0,
          notFound: err?.code === 'ENOENT',
          tail: output.length > OUTPUT_TAIL_CHARS ? output.slice(-OUTPUT_TAIL_CHARS) : output,
        })
      }
    )
  })
}

/** tests-green: run the repo's own suite. Facts only. */
export async function checkTestsGreen(repoPath) {
  const test = detectTestCommand(repoPath)
  if (!test) return { status: 'unknown', detail: 'No test command detected (package.json test script, cargo, go, pytest)' }
  const result = await runCommand(repoPath, test.cmd, test.args, TEST_TIMEOUT_MS)
  if (result.notFound) return { status: 'unknown', detail: `${test.cmd} is not installed` }
  if (result.ok) return { status: 'holding', detail: 'Test suite green' }
  return { status: 'drifting', detail: `Test suite failing:\n${result.tail}` }
}

/** deps-fresh: npm outdated (exit 1 with JSON body when anything is outdated). */
export async function checkDepsFresh(repoPath) {
  if (!existsSync(join(repoPath, 'package.json'))) {
    return { status: 'unknown', detail: 'No package.json — dependency check currently supports npm projects' }
  }
  const result = await runCommand(repoPath, 'npm', ['outdated', '--json'])
  if (result.notFound) return { status: 'unknown', detail: 'npm is not installed' }
  let outdated = {}
  try {
    outdated = JSON.parse(result.tail || '{}')
  } catch {
    return { status: 'unknown', detail: 'Could not parse npm outdated output' }
  }
  const names = Object.keys(outdated)
  if (names.length === 0) return { status: 'holding', detail: 'All dependencies current' }
  const majors = names.filter((n) => {
    const current = String(outdated[n].current || '').split('.')[0]
    const latest = String(outdated[n].latest || '').split('.')[0]
    return current && latest && current !== latest
  })
  return {
    status: 'drifting',
    detail: `${names.length} outdated (${majors.length} major): ${names.slice(0, 12).join(', ')}`,
    meta: { names, majors },
  }
}

/** backlog-triaged: open GitHub issues, flagging ones with no labels. */
export async function checkBacklog(repoPath, maxOpen = 10) {
  const result = await runCommand(repoPath, 'gh', ['issue', 'list', '--limit', '50', '--json', 'number,labels'])
  if (result.notFound) return { status: 'unknown', detail: 'gh CLI is not installed' }
  if (!result.ok) return { status: 'unknown', detail: `gh error: ${result.tail.split('\n')[0].slice(0, 120)}` }
  let issues = []
  try {
    issues = JSON.parse(result.tail || '[]')
  } catch {
    return { status: 'unknown', detail: 'Could not parse gh output' }
  }
  const untriaged = issues.filter((i) => !i.labels || i.labels.length === 0)
  if (issues.length <= maxOpen && untriaged.length === 0) {
    return { status: 'holding', detail: `${issues.length} open issues, all triaged` }
  }
  return {
    status: 'drifting',
    detail: `${issues.length} open issues (target ${maxOpen}), ${untriaged.length} untriaged`,
    meta: { open: issues.length, untriaged: untriaged.map((i) => i.number) },
  }
}
