# Claude Basecamp

Zero-config localhost dashboard for Claude Code sessions, agents, usage, and connectors.

## Hard constraints

- **Zero runtime dependencies.** Plain Node 18+ (`node:http`, `node:fs`, `node:test`), vanilla JS frontend, no build step. Do not add packages without explicit discussion.
- **Read-only on Claude data.** Never write to `~/.claude` or `~/.claude.json`.
- **Local only.** Server binds `127.0.0.1`; nothing leaves the machine.
- ESM everywhere (`"type": "module"`).

## Commands

- `npm test` — run all tests (node:test + fixtures in `test/fixtures/claude-dir/`)
- `npm run dev` — start server without opening a browser
- `node bin/basecamp.js --dir test/fixtures/claude-dir --no-open` — run against fixtures

## Architecture

- `bin/basecamp.js` — CLI: arg parsing, browser launch
- `src/server.js` — routes: `/api/{overview,projects,sessions,session,agents,connectors,usage}` + static `public/`
- `src/lib/sessions.js` — fast fs-stat listing; streamed JSONL parsing with mtime cache
- `src/lib/usage.js` — token aggregation, capped at 200 recent sessions, graphify candidates
- `public/app.js` — tab-based dashboard, 5s polling on cheap tabs only

## Conventions

- Listing endpoints must stay fs-stat-only (fast); transcript parsing only on demand and always mtime-cached
- Tolerate malformed/unknown JSONL entries silently — Claude's transcript format evolves
- New parsers get a fixture in `test/fixtures/claude-dir/` and tests before implementation
