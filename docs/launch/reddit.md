# r/ClaudeAI post

**Title:**
I built a local dashboard that gives every repo its own Claude Code manager (open source, public domain)

**Body:**

Claude Code stores everything locally — every session transcript, token counts, your agents, your MCP servers — but there's no way to see any of it. I checked mine: 7 billion tokens of history, 120+ sessions, invisible.

So I built **Basecamp**. One command, no install, no config:

```
npx claude-basecamp
```

It opens a localhost dashboard that:

- **Gives every repo a manager** — a persistent Claude agent you chat with. Tell it "run the tests every night and fix failures" and it creates the schedule itself. It tracks goals, writes notes to BASECAMP.md, and remembers everything between sessions.
- **Runs Claude while you're away** — scheduled routines + background runs, with git commits linked to the run that made them.
- **Reaches you** — Slack/Discord/Telegram/macOS notifications, plus a "while you were away" digest when you come back.
- **Shows you everything** — GitHub-style activity heatmap, token charts, run success rates, all your agents and MCP connectors.
- **Works from inside Claude Code too** — it's also an MCP server (`claude mcp add basecamp -- npx claude-basecamp mcp`).

Zero runtime dependencies, everything stays on 127.0.0.1, read-only on your Claude data. Public domain (Unlicense), so do literally whatever you want with it.

GitHub: https://github.com/graybyrd13/claude-basecamp

Would love feedback — especially on what connectors you'd want next.
