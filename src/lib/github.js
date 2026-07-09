import { execFile } from 'node:child_process'

const GH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 60 * 1000

// repoPath -> { at, result } — issue/PR lists are polled by the HQ rail.
const cache = new Map()

function gh(repoPath, args) {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      { cwd: repoPath, timeout: GH_TIMEOUT_MS, encoding: 'utf8' },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout))
    )
  })
}

/**
 * Open issues and PRs for a repo via the gh CLI. Degrades gracefully:
 * { available: false, reason } when gh is missing, unauthenticated, or the
 * repo has no GitHub remote. Cached for 60s.
 */
export async function repoGithub(repoPath) {
  const cached = cache.get(repoPath)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result

  let result
  try {
    const [issuesRaw, prsRaw] = await Promise.all([
      gh(repoPath, ['issue', 'list', '--limit', '10', '--json', 'number,title,updatedAt,labels']),
      gh(repoPath, ['pr', 'list', '--limit', '10', '--json', 'number,title,updatedAt,isDraft']),
    ])
    result = {
      available: true,
      issues: JSON.parse(issuesRaw),
      prs: JSON.parse(prsRaw),
    }
  } catch (err) {
    const message = err.message || ''
    const reason = /ENOENT/.test(message)
      ? 'gh CLI not installed'
      : /auth|logged/i.test(message)
        ? 'gh not authenticated (run: gh auth login)'
        : /no git remote|not a git repo|could not determine/i.test(message)
          ? 'no GitHub remote'
          : message.split('\n')[0].slice(0, 120)
    result = { available: false, reason }
  }
  cache.set(repoPath, { at: Date.now(), result })
  return result
}

/** Prompt for a background run that works a GitHub issue end to end. */
export function issueRunPrompt(issueNumber) {
  return (
    `Work on GitHub issue #${issueNumber} in this repository. ` +
    `Read it with "gh issue view ${issueNumber}" first. Implement the fix or feature it describes, ` +
    `run the test suite, and commit your work with a clear message referencing #${issueNumber}. ` +
    `Finish by summarizing what you changed.`
  )
}
