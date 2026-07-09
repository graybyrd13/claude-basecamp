import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listProjects, listSessions, summarizeSession } from './lib/sessions.js'
import { listAgents } from './lib/agents.js'
import { listConnectors, listPlugins } from './lib/connectors.js'
import { usageReport } from './lib/usage.js'

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public')

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

async function handleApi(req, res, url, claudeDir) {
  const route = url.pathname
  try {
    if (route === '/api/overview') {
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
        agentCount: listAgents(claudeDir).length,
        connectorCount: listConnectors(claudeDir).length,
      })
    }
    if (route === '/api/projects') {
      return json(res, 200, listProjects(claudeDir))
    }
    if (route === '/api/sessions') {
      const projectId = url.searchParams.get('project')
      if (!projectId) return json(res, 400, { error: 'Missing ?project= parameter' })
      return json(res, 200, listSessions(claudeDir, projectId))
    }
    if (route === '/api/session') {
      const projectId = url.searchParams.get('project')
      const sessionId = url.searchParams.get('id')
      if (!projectId || !sessionId) {
        return json(res, 400, { error: 'Missing ?project= or ?id= parameter' })
      }
      const summary = await summarizeSession(claudeDir, projectId, sessionId)
      if (!summary) return json(res, 404, { error: 'Session not found' })
      return json(res, 200, summary)
    }
    if (route === '/api/agents') {
      return json(res, 200, listAgents(claudeDir))
    }
    if (route === '/api/connectors') {
      return json(res, 200, { connectors: listConnectors(claudeDir), plugins: listPlugins(claudeDir) })
    }
    if (route === '/api/usage') {
      const windowDays = Number(url.searchParams.get('days')) || 30
      return json(res, 200, await usageReport(claudeDir, { windowDays }))
    }
    return json(res, 404, { error: 'Not found' })
  } catch (err) {
    return json(res, 500, { error: err.message })
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
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

export function startServer({ port, claudeDir, host = '127.0.0.1' }) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url, claudeDir)
    } else {
      handleStatic(res, url.pathname)
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      resolve({ server, url: `http://${host}:${port}` })
    })
  })
}
