# Contributing to Claude Basecamp

Thanks for helping! The project is intentionally simple: **zero runtime dependencies, no build step**.

## The fastest ways to contribute

Most contributions don't need to touch the core:

1. **Catalog entries** (5-minute PR): add an MCP connector or skill to [catalog.json](catalog.json). It ships to every user immediately — no release needed. Use the "Catalog submission" issue template or just open the PR.
2. **Check builtins**: add a drift check for your ecosystem (Python deps, cargo audit, docs freshness) — one self-contained entry in `BUILTINS` in [src/lib/reconcile.js](src/lib/reconcile.js) plus a checker in [src/lib/checks.js](src/lib/checks.js).
3. **Notification channels**: one function in [src/lib/notify.js](src/lib/notify.js) per channel (ntfy, Pushover, Matrix…).
4. **Good first issues**: [browse them](https://github.com/graybyrd13/claude-basecamp/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — each is scoped to roughly an evening.

New to the codebase? [ARCHITECTURE.md](ARCHITECTURE.md) is the 5-minute map. Reviews aim for a 24-hour first response.

## Principles

1. **Zero friction** — `npx claude-basecamp` must always Just Work. No config files, no database, no install steps.
2. **Read-only by default** — Basecamp never modifies Claude's data unless a feature explicitly and obviously does so (and asks first).
3. **Local only** — nothing leaves the user's machine. The server binds to `127.0.0.1`.
4. **Zero dependencies** — plain Node (18+) and vanilla JS in the browser. Think hard before proposing a dependency.

## Setup

```bash
git clone https://github.com/graybyrd13/claude-basecamp
cd claude-basecamp
npm test
npm run dev
```

## Project layout

```
bin/basecamp.js       CLI entry (arg parsing, browser open)
src/server.js         HTTP server + API routes
src/lib/sessions.js   Project/session discovery + transcript parsing
src/lib/agents.js     Agent definition parsing
src/lib/connectors.js MCP server / plugin discovery
src/lib/usage.js      Token aggregation + graphify candidates
public/               Dashboard (vanilla HTML/CSS/JS, no build)
test/                 node:test suites + fixtures
```

## Pull requests

- Write tests first where practical (`node:test`, fixtures under `test/fixtures/`)
- Keep files focused (<400 lines) and functions small
- Commit messages: `<type>: <description>` (feat, fix, refactor, docs, test, chore)
- Run `npm test` before pushing

## Reporting issues

Include your OS, Node version, and — if it's a parsing issue — a **redacted** sample of the JSONL line that broke. Never paste real transcript content containing private data.
