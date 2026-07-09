# Contributing to Claude Basecamp

Thanks for helping! The project is intentionally simple: **zero runtime dependencies, no build step**.

## Principles

1. **Zero friction** — `npx claude-basecamp` must always Just Work. No config files, no database, no install steps.
2. **Read-only by default** — Basecamp never modifies Claude's data unless a feature explicitly and obviously does so (and asks first).
3. **Local only** — nothing leaves the user's machine. The server binds to `127.0.0.1`.
4. **Zero dependencies** — plain Node (18+) and vanilla JS in the browser. Think hard before proposing a dependency.

## Setup

```bash
git clone https://github.com/graysonheim/claude-basecamp
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
