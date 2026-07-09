# Show HN post

**Title:**
Show HN: Basecamp – a local dashboard that gives every repo a Claude Code manager

**URL:** https://github.com/graybyrd13/claude-basecamp

**First comment (post immediately after submitting):**

Hi HN — I built this because Claude Code writes an enormous amount of history to your machine (session transcripts, token usage, agents, MCP config) and none of it is visible anywhere. My machine had 7B+ tokens of history I'd never seen.

Basecamp is a zero-dependency Node server (`npx claude-basecamp`) that reads that data and puts an operations layer on top:

- Every repo gets a persistent "manager" — a Claude agent you chat with that can schedule recurring runs, track goals, set up hooks, and launch background work. It keeps its notes in a BASECAMP.md in your repo.
- Routines run Claude headless on a schedule ("run the tests every night, fix what fails, commit"). Each one also has a webhook URL so CI can trigger it.
- Runs are linked to the git commits they produce.
- Slack/Discord/Telegram/macOS notifications when runs finish, and a "while you were away" digest.
- It's also an MCP server, so any Claude session can control it.

Design constraints I held: zero runtime dependencies, no build step, strictly read-only on Claude's own data (one explicit opt-in exception for adding MCP servers), and everything bound to 127.0.0.1 — nothing leaves your machine.

Public domain (Unlicense). Happy to answer anything.
