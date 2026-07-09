import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listProjects, listSessions, summarizeSession } from './lib/sessions.js'
import { listRealProjects } from './lib/projects.js'
import { listAgents } from './lib/agents.js'
import { listConnectors, listPlugins } from './lib/connectors.js'
import { usageReport } from './lib/usage.js'
import { openStores } from './lib/store.js'
import { launchRun, stopRun, readRunLog, runningCount } from './lib/runner.js'
import { startScheduler, nextRunTime, describeSchedule } from './lib/scheduler.js'
import { sendChatMessage, chatBusy, chatHistory } from './lib/chat.js'

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public')
const MAX_BODY_BYTES = 256 * 1024

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * CSRF guard: mutating requests must come from our own origin.
 * A malicious website can POST to localhost, but the browser attaches
 * its Origin header — reject anything that isn't ours (or a non-browser client).
 */
function isSameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // curl / same-origin GET-initiated fetch without Origin
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function routineToJson(routine) {
  return { ...routine, scheduleLabel: describeSchedule(routine.schedule) }
}

function validateRoutine(body) {
  const errors = []
  if (!body.name || !String(body.name).trim()) errors.push('name is required')
  if (!body.projectPath) errors.push('projectPath is required')
  if (!body.prompt || !String(body.prompt).trim()) errors.push('prompt is required')
  if (!nextRunTime(body.schedule)) errors.push('schedule is invalid')
  return errors
}

async function handleApi(req, res, url, ctx) {
  const { claudeDir, stores } = ctx
  const route = url.pathname
  const method = req.method

  if (method !== 'GET' && !isSameOrigin(req)) {
    return json(res, 403, { error: 'Cross-origin request rejected' })
  }

  try {
    // ---------- read-only: claude data ----------
    if (route === '/api/overview' && method === 'GET') {
      const projects = listProjects(claudeDir)
      const activeSessions = []
      for (const project of projects.filter((p) => p.isActive)) {
        for (const session of listSessions(claudeDir, project.id)) {
          if (session.isActive) activeSessions.push(session)
        }
      }
      return json(res, 200, {
        claudeDir,
        projectCount: projects.length,
        sessionCount: projects.reduce((sum, p) => sum + p.sessionCount, 0),
        activeSessions,
        runningTasks: runningCount(),
        agentCount: listAgents(claudeDir).length,
        connectorCount: listConnectors(claudeDir).length,
      })
    }
    if (route === '/api/projects' && method === 'GET') {
      return json(res, 200, listRealProjects(claudeDir))
    }
    if (route === '/api/sessions' && method === 'GET') {
      const projectId = url.searchParams.get('project')
      if (!projectId) return json(res, 400, { error: 'Missing ?project= parameter' })
      return json(res, 200, listSessions(claudeDir, projectId))
    }
    if (route === '/api/session' && method === 'GET') {
      const projectId = url.searchParams.get('project')
      const sessionId = url.searchParams.get('id')
      if (!projectId || !sessionId) {
        return json(res, 400, { error: 'Missing ?project= or ?id= parameter' })
      }
      const summary = await summarizeSession(claudeDir, projectId, sessionId)
      if (!summary) return json(res, 404, { error: 'Session not found' })
      return json(res, 200, summary)
    }
    if (route === '/api/agents' && method === 'GET') {
      return json(res, 200, listAgents(claudeDir))
    }
    if (route === '/api/connectors' && method === 'GET') {
      return json(res, 200, {
        connectors: listConnectors(claudeDir),
        plugins: listPlugins(claudeDir),
      })
    }
    if (route === '/api/usage' && method === 'GET') {
      const windowDays = Number(url.searchParams.get('days')) || 30
      return json(res, 200, await usageReport(claudeDir, { windowDays }))
    }

    // ---------- routines ----------
    if (route === '/api/routines' && method === 'GET') {
      return json(res, 200, stores.routines.list().map(routineToJson))
    }
    if (route === '/api/routines' && method === 'POST') {
      const body = await readBody(req)
      const errors = validateRoutine(body)
      if (errors.length) return json(res, 400, { error: errors.join('; ') })
      const routine = stores.routines.insert({
        name: String(body.name).trim(),
        projectPath: body.projectPath,
        prompt: String(body.prompt).trim(),
        schedule: body.schedule,
        permissionMode: body.permissionMode || 'acceptEdits',
        model: body.model || null,
        enabled: body.enabled !== false,
        nextRun: nextRunTime(body.schedule),
        lastRun: null,
      })
      return json(res, 201, routineToJson(routine))
    }
    const routineMatch = route.match(/^\/api\/routines\/([\w-]+)(\/run)?$/)
    if (routineMatch) {
      const routine = stores.routines.get(routineMatch[1])
      if (!routine) return json(res, 404, { error: 'Routine not found' })
      if (routineMatch[2] === '/run' && method === 'POST') {
        const run = launchRun(stores, {
          projectPath: routine.projectPath,
          prompt: routine.prompt,
          permissionMode: routine.permissionMode,
          model: routine.model,
          routineId: routine.id,
          routineName: routine.name,
        })
        stores.routines.update(routine.id, { lastRun: Date.now() })
        return json(res, 201, run)
      }
      if (method === 'PUT') {
        const body = await readBody(req)
        const merged = { ...routine, ...body }
        const errors = validateRoutine(merged)
        if (errors.length) return json(res, 400, { error: errors.join('; ') })
        const updated = stores.routines.update(routine.id, {
          ...body,
          nextRun: merged.enabled === false ? null : nextRunTime(merged.schedule),
        })
        return json(res, 200, routineToJson(updated))
      }
      if (method === 'DELETE') {
        stores.routines.remove(routine.id)
        return json(res, 200, { ok: true })
      }
    }

    // ---------- runs ----------
    if (route === '/api/runs' && method === 'GET') {
      return json(res, 200, stores.runs.list())
    }
    if (route === '/api/runs' && method === 'POST') {
      const body = await readBody(req)
      const run = launchRun(stores, {
        projectPath: body.projectPath,
        prompt: body.prompt,
        permissionMode: body.permissionMode || 'acceptEdits',
        model: body.model || null,
      })
      return json(res, 201, run)
    }
    const runMatch = route.match(/^\/api\/runs\/([\w-]+)(\/log|\/stop)?$/)
    if (runMatch) {
      const run = stores.runs.get(runMatch[1])
      if (!run) return json(res, 404, { error: 'Run not found' })
      if (!runMatch[2] && method === 'GET') return json(res, 200, run)
      if (runMatch[2] === '/log' && method === 'GET') {
        return json(res, 200, { id: run.id, status: run.status, log: readRunLog(stores, run.id) })
      }
      if (runMatch[2] === '/stop' && method === 'POST') {
        stopRun(stores, run.id)
        return json(res, 200, stores.runs.get(run.id))
      }
    }

    // ---------- goals ----------
    if (route === '/api/goals' && method === 'GET') {
      const project = url.searchParams.get('project')
      const goals = stores.goals.list()
      return json(res, 200, project ? goals.filter((g) => g.projectPath === project) : goals)
    }
    if (route === '/api/goals' && method === 'POST') {
      const body = await readBody(req)
      if (!body.projectPath || !body.title?.trim()) {
        return json(res, 400, { error: 'projectPath and title are required' })
      }
      return json(res, 201, stores.goals.insert({
        projectPath: body.projectPath,
        title: String(body.title).trim(),
        notes: body.notes || null,
        status: 'open',
      }))
    }
    const goalMatch = route.match(/^\/api\/goals\/([\w-]+)$/)
    if (goalMatch) {
      const goal = stores.goals.get(goalMatch[1])
      if (!goal) return json(res, 404, { error: 'Goal not found' })
      if (method === 'PUT') {
        const body = await readBody(req)
        if (body.status && !['open', 'done'].includes(body.status)) {
          return json(res, 400, { error: 'status must be open or done' })
        }
        return json(res, 200, stores.goals.update(goal.id, body))
      }
      if (method === 'DELETE') {
        stores.goals.remove(goal.id)
        return json(res, 200, { ok: true })
      }
    }

    // ---------- manager chat ----------
    if (route === '/api/chat/history' && method === 'GET') {
      const project = url.searchParams.get('project')
      if (!project) return json(res, 400, { error: 'Missing ?project= parameter' })
      return json(res, 200, { messages: chatHistory(stores, project), busy: chatBusy(project) })
    }
    if (route === '/api/chat' && method === 'POST') {
      const body = await readBody(req)
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      })
      try {
        await sendChatMessage(
          stores,
          { projectPath: body.projectPath, message: body.message, port: ctx.port },
          (event) => res.write(JSON.stringify(event) + '\n')
        )
      } catch (err) {
        res.write(JSON.stringify({ type: 'done', error: err.message }) + '\n')
      }
      return res.end()
    }

    // ---------- updates feed ----------
    if (route === '/api/updates' && method === 'GET') {
      return json(res, 200, stores.updates.list())
    }
    if (route === '/api/updates' && method === 'DELETE') {
      for (const update of stores.updates.list()) stores.updates.remove(update.id)
      return json(res, 200, { ok: true })
    }

    return json(res, 404, { error: 'Not found' })
  } catch (err) {
    const status = /required|invalid|too large|does not exist/i.test(err.message) ? 400 : 500
    return json(res, status, { error: err.message })
  }
}

async function handleStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname
  const filePath = normalize(join(PUBLIC_DIR, requested))
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  try {
    const content = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

export function startServer({ port, claudeDir, host = '127.0.0.1', basecampHome }) {
  const stores = openStores(basecampHome)
  const ctx = { claudeDir, stores, port }
  startScheduler(stores)

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url, ctx)
    } else {
      handleStatic(res, url.pathname)
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      ctx.port = server.address().port // resolve the real port when 0 was requested
      resolve({ server, stores, url: `http://${host}:${ctx.port}` })
    })
  })
}
