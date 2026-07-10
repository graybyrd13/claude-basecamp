# Architecture

Basecamp is a zero-dependency Node server (18+) plus a vanilla-JS single-page frontend. No build step, no database — state is JSON files. This document is the map; each section is small enough to read in one sitting.

```
bin/basecamp.js          CLI entry: arg parsing, browser open, `mcp` subcommand
src/server.js            HTTP server: every /api route, static file serving, CSRF guard
src/mcp-server.js        MCP stdio server (proxies to the HTTP API)
src/lib/                 All logic, one concern per file
public/                  Frontend: index.html + app.js + style.css (vanilla, no framework)
test/                    node:test suites; fixtures in test/fixtures/claude-dir/
catalog.json             The community catalog (fetched live from main by every install)
```

## Data flow

**Claude's data (read-only)** lives in `~/.claude` — session transcripts as JSONL under `projects/<encoded-path>/`, agents as markdown, MCP config in `~/.claude.json`. Parsers:

- `lib/sessions.js` — fast fs-stat listing; streamed JSONL summaries cached by mtime
- `lib/projects.js` — real repo paths from the `~/.claude.json` registry, grouped by git repo root (worktrees and working subdirs fold into their repo; scratch dirs drop)
- `lib/agents.js`, `lib/connectors.js`, `lib/usage.js` — agents, MCP servers, token aggregation

**Basecamp's own state** lives in `~/.claude-basecamp/` via `lib/store.js` — a tiny JSON-collection store (insert/update/remove, temp-file + rename writes). Collections: routines, runs, updates, goals, managers, messages, settings, intents (checks), antibodies, reflex, ledger (monthly spend).

## The engines

- `lib/runner.js` — spawns headless `claude -p` runs (stream-json), links resulting git commits (`lib/git.js`), pauses on permission denials as **awaiting-approval** (`approveRun`/`denyRun` resume with a one-turn grant)
- `lib/chat.js` — per-repo **manager** conversations: `claude -p --resume <session>` with a system-prompt cookbook for Basecamp's own API
- `lib/scheduler.js` — fires **routines** on interval/daily/weekly schedules
- `lib/reconcile.js` + `lib/checks.js` — **Checks**: deterministic drift detection (real test suite, `npm outdated`, `gh`) or plain-English evaluation, convergence runs on failure, escalation to decision cards. Bounded: concurrency cap, daily attempt cap, exponential backoff per check
- `lib/governor.js` — **Budgets**: every run's CLI-reported cost accrues into a durable monthly ledger; global and per-repo dollar caps gate autonomous launches (checks and routines). Over budget, work pauses with a decision card — manual runs are never blocked
- `lib/rescue.js` — **Session Rescue**: classifies how transcripts ended; resumes dead sessions
- `lib/immune.js` + `lib/hook-installer.js` — **Reflexes**: mines transcripts for human pushback into antibodies; an opt-in PreToolUse hook makes every session consult `/api/reflex/hook` before mutating actions
- `lib/catalog.js` — one-click installs; remote catalog with bundled fallback, trusted-repo allowlist
- `lib/notify.js` — Slack/Discord/Telegram webhooks + native macOS/Windows notifications
- `lib/env.js` — sanitizes child env (stale `ANTHROPIC_*` overrides break child `claude` processes)

## Frontend

`public/app.js` is one file, organized by page: chat landing → home → repos → HQ (manager chat + rail) → checks → reflexes → routines → runs → stats → catalog → settings. Rendering is string templates + `innerHTML`; polling re-renders are snapshot-guarded and never fire while the user is typing. Icons are inline SVG (no emoji). `style.css` is GitHub-Primer-flavored monochrome with dark mode via `prefers-color-scheme`.

## Invariants (do not break)

1. **Zero runtime dependencies.** `npm install` installs nothing.
2. **Read-only on `~/.claude`**, except: connector add/remove and skill installs (confirmed + backed up) and the opt-in reflex hook in `settings.json`.
3. **Localhost only.** Server binds `127.0.0.1`; mutating routes reject cross-origin.
4. **Never `git push` from automation.** Convergence allowlists cover local git only.
5. **Windows is CI-enforced.** Spawns need `shell: true` for npm shims; no glob in test scripts; file handles lock briefly after close.
6. **Transcript formats evolve** — parsers tolerate unknown/malformed entries silently, and new parsers ship with fixtures.
