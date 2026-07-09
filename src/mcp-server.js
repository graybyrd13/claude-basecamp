import { createInterface } from 'node:readline'

/**
 * Minimal MCP server (stdio transport, newline-delimited JSON-RPC) that
 * proxies to a running Basecamp HTTP API. Register with:
 *   claude mcp add basecamp -- npx claude-basecamp mcp
 * Requires Basecamp to be running (default http://127.0.0.1:4747, override
 * with BASECAMP_URL).
 */

const BASE_URL = process.env.BASECAMP_URL || `http://127.0.0.1:${process.env.BASECAMP_PORT || 4747}`
const PROTOCOL_VERSION = '2024-11-05'

const TOOLS = [
  {
    name: 'basecamp_overview',
    description: 'Current Basecamp status: session/repo counts, active sessions, running tasks.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => call('GET', '/api/overview'),
  },
  {
    name: 'basecamp_list_routines',
    description: 'List all scheduled routines with their schedules and next run times.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => call('GET', '/api/routines'),
  },
  {
    name: 'basecamp_create_routine',
    description:
      'Schedule a recurring Claude Code run. schedule examples: {"type":"daily","time":"09:00"} | {"type":"interval","minutes":120} | {"type":"weekly","day":1,"time":"09:00"}',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        projectPath: { type: 'string', description: 'Absolute path of the repository' },
        prompt: { type: 'string', description: 'What Claude should do on each run' },
        schedule: { type: 'object' },
        model: { type: 'string', description: 'sonnet | haiku | opus (optional)' },
      },
      required: ['name', 'projectPath', 'prompt', 'schedule'],
    },
    handler: (args) => call('POST', '/api/routines', args),
  },
  {
    name: 'basecamp_run_task',
    description: 'Launch a one-off background Claude Code run in a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        prompt: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['projectPath', 'prompt'],
    },
    handler: (args) => call('POST', '/api/runs', args),
  },
  {
    name: 'basecamp_list_runs',
    description: 'List recent background runs with status, cost, and linked commits.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await call('GET', '/api/runs')).slice(0, 20),
  },
  {
    name: 'basecamp_list_goals',
    description: 'List project goals. Optionally filter by projectPath.',
    inputSchema: { type: 'object', properties: { projectPath: { type: 'string' } } },
    handler: (args) =>
      call('GET', args.projectPath ? `/api/goals?project=${encodeURIComponent(args.projectPath)}` : '/api/goals'),
  },
  {
    name: 'basecamp_create_goal',
    description: 'Record a goal for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['projectPath', 'title'],
    },
    handler: (args) => call('POST', '/api/goals', args),
  },
  {
    name: 'basecamp_digest',
    description: 'Everything that happened (finished runs, routine results) since the user last checked Basecamp.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => call('GET', '/api/digest'),
  },
]

async function call(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error(`Basecamp is not running at ${BASE_URL} — start it with: npx claude-basecamp`)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function replyError(id, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } }) + '\n')
}

export function startMcpServer() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', async (line) => {
    if (!line.trim()) return
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const { id, method, params } = msg
    if (method === 'initialize') {
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'claude-basecamp', version: '0.4.0' },
      })
    }
    if (method === 'notifications/initialized') return
    if (method === 'ping') return reply(id, {})
    if (method === 'tools/list') {
      return reply(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })
    }
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name)
      if (!tool) return replyError(id, `Unknown tool: ${params?.name}`)
      try {
        const result = await tool.handler(params.arguments || {})
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
      } catch (err) {
        return reply(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true })
      }
    }
    if (id !== undefined) replyError(id, `Unknown method: ${method}`)
  })
}
