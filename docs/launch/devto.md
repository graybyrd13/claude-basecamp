# dev.to article

**Title:** Your Claude Code already has billions of tokens of history on your machine. Here's how to see it — and put a manager on top.

**Tags:** ai, claudecode, opensource, productivity

---

Claude Code persists everything it does to your machine: full session transcripts as JSONL under `~/.claude/projects/`, token usage on every message, your agent definitions, your MCP server config. Almost nobody looks at it, because nothing reads it.

I wrote a small zero-dependency tool that does — and then grew it into something more useful than a viewer.

## The 10-second demo

```bash
npx claude-basecamp
```

That's the whole setup. It reads the data Claude Code already wrote and opens a dashboard at `localhost:4747`: every repo, every session, a GitHub-style activity heatmap, token charts, and — the part I now can't work without — a **manager per repo**.

## What's a manager?

A persistent Claude agent scoped to one repository. You chat with it from the dashboard, and it can:

- **Schedule routines**: "Run the test suite every night at 9. Fix what fails and commit." It creates the schedule via Basecamp's local API and confirms the next run time.
- **Track goals**: "Our goal is to ship v1 by end of month" becomes a tracked item next to the chat.
- **Configure your repo**: hooks in `.claude/settings.json`, CLAUDE.md, git workflows — it has full Claude Code tools in that directory.
- **Remember**: it resumes the same session every time and keeps human-readable notes in `BASECAMP.md` at your repo root.

## Closing the loop

The rest of the system exists so the manager's work doesn't disappear into the void:

- Background runs are linked to the **git commits** they produce.
- **Notifications** (Slack/Discord/Telegram/macOS) fire when runs finish or fail.
- A **"while you were away" digest** greets you with everything that happened since you last looked.
- Every routine has a **webhook URL**, so your CI can trigger "fix the build" automatically on failure.
- It's an **MCP server** too — any Claude session can check the digest or schedule work: `claude mcp add basecamp -- npx claude-basecamp mcp`.

## Design constraints

- **Zero runtime dependencies.** Plain Node 18+, vanilla JS frontend, no build step. `npm install` installs nothing.
- **Read-only on Claude's data**, with one explicit, confirmed, backed-up exception (adding MCP servers from the UI).
- **Local only.** Binds to 127.0.0.1; mutating endpoints reject cross-origin requests.

It's public domain (Unlicense): https://github.com/graybyrd13/claude-basecamp

I'd genuinely like to know what breaks on your machine — transcript formats evolve and I'd rather fix parsers than guess.
