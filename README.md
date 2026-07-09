# Claude Basecamp

[![npm](https://img.shields.io/npm/v/claude-basecamp.svg)](https://www.npmjs.com/package/claude-basecamp)
[![Tests](https://github.com/graybyrd13/claude-basecamp/actions/workflows/test.yml/badge.svg)](https://github.com/graybyrd13/claude-basecamp/actions/workflows/test.yml)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-black.svg)](package.json)

**A manager for every project — running on your machine.** Basecamp gives each of your projects a persistent Claude manager you talk to from a localhost dashboard. It sets up automation, tracks goals, launches background work, and keeps development moving even when you're not there.

```bash
npx claude-basecamp
```

No install, no database, no config. Basecamp discovers the projects Claude Code already knows about and opens at `http://localhost:4747`. Runs on macOS, Linux, and Windows.

<p align="center">
  <img src=".github/screenshots/repositories.png" width="32%" alt="Repositories page listing repos with branch, uncommitted changes, and last commit" />
  <img src=".github/screenshots/manager-chat.png" width="32%" alt="A project manager chat with the goals, routines, and runs rail visible" />
  <img src=".github/screenshots/stats-activity.png" width="32%" alt="Stats page with the activity heatmap and token usage chart" />
</p>

## What you can do

**Talk to your repository's manager.** Every project gets a persistent agent with full Claude Code tools in that directory, plus control over Basecamp itself:

> *"Run the test suite every night at 9 and fix whatever fails."* → it creates the routine
> *"Our goal is to ship v1 by end of month — track it."* → it records the goal
> *"Set up a hook that runs prettier after every edit."* → it edits `.claude/settings.json`
> *"What's the state of this repo?"* → it reads the code and tells you

Managers remember everything across sessions — close the tab, come back tomorrow, it knows where you left off.

**Routines** — scheduled prompts that run Claude Code headless in your projects (every N minutes, daily, weekly). Created in the UI or by asking a manager.

**Background runs** — one-off tasks ("continue development", "fix the failing CI") that run without blocking anything, with live logs, cost tracking, and stop buttons.

**Updates feed** — every routine result and finished run reports back here. Open Basecamp in the morning and see what happened overnight.

**Goals** — per-project objectives, visible next to the chat, checked off by you or the manager.

**Away digest** — open Basecamp after time away and the top of Home summarizes everything that happened since you last looked.

**Git-aware repositories** — every repo shows its branch, uncommitted changes, ahead/behind state, and last commit. Runs that produce commits are linked to them in the feed. Active Claude sessions are visible inside each repo's manager view.

**Stats** — an activity heatmap, animated token charts, background-run performance (success rate, durations, cost, commits), agents, MCP connectors, and graphify candidates (sessions with heavy repeated-context reads, the best targets for knowledge-graph token reduction).

**Command palette** — `Cmd+K` to jump to any repo's manager or fire any action.

**Approval queue** — if a background run hits a permission wall it can't clear headlessly, it pauses as "awaiting approval" on Home with the requested command, instead of just failing. Approve to resume with that one action granted, or deny to stop it there.

**Notifications** — Slack, Discord, Telegram, and native desktop notifications (macOS, Windows) when runs finish, fail, or need approval. Configure them on the Settings page; Basecamp reaches you wherever you are.

**Incoming webhooks** — every routine has a secret URL. `curl -X POST` it from CI or a GitHub Action to trigger the routine ("build failed → Claude fixes it").

**GitHub issues and PRs** — each repo's manager view lists open issues and pull requests (via the `gh` CLI). One click launches a background run that works the issue end to end.

**Routine templates** — one-click recipes: nightly test fixer, morning briefing, changelog keeper, TODO triager, dependency watcher.

**MCP server mode** — `claude mcp add basecamp -- npx claude-basecamp mcp` and every Claude Code session can check the digest, schedule routines, and launch runs through `basecamp_*` tools.

**Connector management** — view every MCP server across your Claude config, and add or remove user-scope connectors from the dashboard (explicit opt-in write with automatic backup).

**Catalog** — one-click installs for popular connectors (GitHub, Notion, Linear, Sentry, Context7, Playwright, and more) and official Anthropic skills (Word/Excel/PowerPoint/PDF, canvas design, MCP builder…). Community-curated via [catalog.json](catalog.json) — new entries reach every user without a release. Skill downloads are pinned to trusted repos with size caps and path guards.

The UI is minimal black-and-white, GitHub-style, with no build step — and each manager keeps durable, human-readable notes in `BASECAMP.md` at the repo root.

## Options

```
claude-basecamp [options]

--port <n>     Port to listen on (default: 4747, env: BASECAMP_PORT)
--dir <path>   Claude data directory (default: ~/.claude, env: CLAUDE_CONFIG_DIR)
--no-open      Don't open the browser automatically
```

Basecamp's own state (routines, runs, goals, chat history) lives in `~/.claude-basecamp/` (override with `BASECAMP_HOME`).

## How it works

- **Reads** the session transcripts, agents, and connector config Claude Code already writes locally (`~/.claude`, `~/.claude.json`) — strictly read-only.
- **Spawns** `claude` headless (`-p --output-format stream-json`) for manager chats, routines, and runs. Managers resume a persistent session per project.
- **Serves** everything from a zero-dependency Node server bound to `127.0.0.1`. Nothing leaves your machine. Mutating endpoints reject cross-origin requests.
- Child `claude` processes get a sanitized environment (stale `ANTHROPIC_*` overrides stripped) so they authenticate the same way your normal Claude Code does. Set `BASECAMP_KEEP_ENV=1` if you authenticate via `ANTHROPIC_API_KEY` on purpose.

Zero runtime dependencies. Node 18+ and an installed [Claude Code](https://claude.com/claude-code).

## Security

This tool reads your Claude Code history and runs Claude unattended, so the security posture is deliberately simple enough to verify yourself:

- **Zero dependencies.** No supply chain. The entire codebase is ~4,000 lines of plain Node and vanilla JS — auditable in one sitting.
- **Local only.** The server binds `127.0.0.1` and nothing is ever sent off your machine. There is no telemetry, no analytics, no phone-home.
- **Read-only on Claude's data.** Transcripts and config are never modified, with one exception: adding/removing MCP connectors from the UI, which requires explicit confirmation and creates a backup of `~/.claude.json` first.
- **CSRF-guarded.** Mutating endpoints reject requests whose `Origin` doesn't match, so a malicious website can't drive your Basecamp. Routine webhooks use unguessable per-routine tokens.
- **Sandboxed by Claude Code's own permissions.** Background runs use Claude Code permission modes (`plan` / `acceptEdits` / etc.) — Basecamp never grants Claude anything your CLI wouldn't.
- **Public domain.** No license gymnastics; fork it, audit it, vendor it.

## Roadmap

- [x] Approval queue: runs pause on permission walls instead of being denied
- [ ] Cost guardrails: per-routine monthly budgets
- [ ] One-click graphify export for token-heavy sessions

## Development

```bash
git clone https://github.com/graybyrd13/claude-basecamp
cd claude-basecamp
npm test        # node:test, zero deps
npm run dev     # start without opening a browser
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Public domain, under the [Unlicense](LICENSE).
