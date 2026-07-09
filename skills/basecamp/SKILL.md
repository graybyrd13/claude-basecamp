---
name: basecamp
description: Start or control Claude Basecamp — the localhost dashboard that gives every repo a persistent manager, scheduled routines, and background runs. Use when the user mentions basecamp, wants a dashboard for their Claude Code sessions, wants scheduled/recurring Claude runs, or asks what happened while they were away.
---

# Claude Basecamp

Basecamp is a zero-dependency localhost dashboard (default http://localhost:4747) that manages Claude Code projects: per-repo manager chats, scheduled routines, background runs, goals, usage stats, and notifications.

## Start the dashboard

Check whether it is already running, then start it if needed:

```bash
curl -s http://127.0.0.1:4747/api/overview || npx claude-basecamp --no-open &
```

Then tell the user it is available at http://localhost:4747.

## Control it from this session

Prefer the MCP tools if the `basecamp` MCP server is registered (tools named `basecamp_*`). Otherwise use the HTTP API directly:

```bash
curl -s http://127.0.0.1:4747/api/digest                 # what happened while the user was away
curl -s http://127.0.0.1:4747/api/routines               # scheduled routines
curl -s -X POST http://127.0.0.1:4747/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"projectPath":"<abs path>","prompt":"<task>","model":"sonnet"}'   # launch a background run
```

To register the MCP server permanently: `claude mcp add basecamp -- npx claude-basecamp mcp`

Schedule shapes for routines: `{"type":"daily","time":"09:00"}`, `{"type":"interval","minutes":120}`, `{"type":"weekly","day":1,"time":"09:00"}`.
