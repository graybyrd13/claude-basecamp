# ⛺ Claude Basecamp

**A zero-config localhost dashboard for Claude Code.** See every session, agent, connector, and token you've spent — across Claude Desktop, the terminal, and the API — in one place.

```bash
npx claude-basecamp
```

That's it. No install, no database, no configuration. Basecamp reads the session data Claude Code already writes to your machine and opens a live dashboard at `http://localhost:4747`.

## What you get

- **Sessions** — every project and session Claude Code has run, with live "active now" indicators, message counts, tool calls, subagent usage, and per-session token breakdowns
- **Agents** — all installed agent definitions with their models, tools, and descriptions
- **Usage** — token consumption over time (input / output / cache read / cache write), daily activity, and your heaviest sessions
- **Connectors** — every MCP server and extension (Gmail, GitHub, Linear, custom servers…) discovered across your user, project, and settings configs
- **Graphify candidates** — sessions with heavy repeated-context reads, flagged as the best targets for [graphify](https://github.com/graysonheim/graphify)-style knowledge-graph token reduction

## Options

```
claude-basecamp [options]

--port <n>     Port to listen on (default: 4747, env: BASECAMP_PORT)
--dir <path>   Claude data directory (default: ~/.claude, env: CLAUDE_CONFIG_DIR)
--no-open      Don't open the browser automatically
```

Point `--dir` at any Claude data directory — useful for shared machines, backups, or custom `CLAUDE_CONFIG_DIR` setups.

## How it works

Claude Code persists everything locally:

| Data | Location |
|---|---|
| Session transcripts | `~/.claude/projects/<project>/<session>.jsonl` |
| Agent definitions | `~/.claude/agents/*.md` |
| MCP connectors | `~/.claude.json`, `~/.claude/settings.json` |

Basecamp reads these **read-only** — it never modifies your Claude configuration or transcripts, and never sends anything off your machine. The server binds to `127.0.0.1` only. Transcript parsing is streamed and cached by file mtime, so even large histories stay fast.

Zero runtime dependencies. Just Node 18+.

## Roadmap

- [ ] Enable/disable connectors from the dashboard
- [ ] Session resume / kill actions (via `claude` CLI integration)
- [ ] Cost estimates per model
- [ ] Away-mode digest: what happened while you were gone
- [ ] Direct graphify integration: one-click knowledge-graph export for token-heavy sessions
- [ ] GitHub bridge: link sessions to the PRs and issues they produced

## Development

```bash
git clone https://github.com/graysonheim/claude-basecamp
cd claude-basecamp
npm test        # node:test, no deps
npm run dev     # start without opening a browser
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
