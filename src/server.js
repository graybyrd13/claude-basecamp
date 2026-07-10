import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listProjects, listSessions, summarizeSession } from './lib/sessions.js'
import { listRepos, listRepoSessions, normalizeStorePaths } from './lib/projects.js'
import { listAgents } from './lib/agents.js'
import { listConnectors, listPlugins } from './lib/connectors.js'
import { usageReport, listRecentModels } from './lib/usage.js'
import { openStores } from './lib/store.js'
import { launchRun, stopRun, approveRun, denyRun, readRunLog, runningCount, EFFORT_LEVELS } from './lib/runner.js'
import { startScheduler, nextRunTime, describeSchedule } from './lib/scheduler.js'
import { sendChatMessage, chatBusy, chatHistory } from './lib/chat.js'
import { gitStatus } from './lib/git.js'
import { repoGithub, issueRunPrompt } from './lib/github.js'
import { addConnector, removeConnector } from './lib/connectors.js'
import { getSettings, updateSettings } from './lib/settings.js'
import { catalogWithStatus, loadCatalog, installSkill, uninstallSkill } from './lib/catalog.js'
import { findRescueCandidates, rescuePrompt, validateRescueTarget } from './lib/rescue.js'
import { BUILTINS, reconcileIntent, intentReport, startReconciler } from './lib/reconcile.js'
import { mineAntibodies, reflexVerdict, immuneStats, bumpCounters } from './lib/immune.js'
import { spendReport } from './lib/governor.js'
import { applyCleanRoom, discardCleanRoom, cleanRoomPatch, sweepCleanRooms } from './lib/cleanroom.js'
import { manifestStatus, adoptManifest, dropManifest, writeManifest } from './lib/manifest.js'
import { createRecall } from './lib/recall.js'
import { installReflexHook, uninstallReflexHook, reflexHookInstalled } from './lib/hook-installer.js'
import { sendNotification } from './lib/notify.js'
import { randomBytes } from 'node:crypto'

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

/** Repos on the board: every repo Claude ran in, plus every repo Basecamp manages. */
function knownRepos(claudeDir, stores) {
  const managed = [
    ...stores.intents.list().map((i) => i.projectPath),
    ...stores.routines.list().map((r) => r.projectPath),
    ...stores.managers.list().map((m) => m.projectPath),
  ]
  return listRepos(claudeDir, managed)
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
  const { claudeDir, stores, recall } = ctx
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
      // Grouped by repo root: worktrees and working subdirs fold into their
      // repo, scratch dirs disappear. The sidebar and pickers build on this.
      const projects = knownRepos(claudeDir, stores)
      if (url.searchParams.get('git') !== '1') return json(res, 200, projects)
      const enriched = await Promise.all(
        projects.map(async (p) => ({
          ...p,
          git: p.exists ? await gitStatus(p.path) : null,
        }))
      )
      return json(res, 200, enriched)
    }
    if (route === '/api/repo/sessions' && method === 'GET') {
      // Active/recent sessions for one repo — shown inside the manager chat rail.
      const path = url.searchParams.get('path')
      if (!path) return json(res, 400, { error: 'Missing ?path= parameter' })
      const repo = knownRepos(claudeDir, stores).find((p) => p.path === path)
      if (!repo) return json(res, 200, [])
      return json(res, 200, listRepoSessions(claudeDir, repo).slice(0, 8))
    }
    if (route === '/api/sessions' && method === 'GET') {
      const projectId = url.searchParams.get('project')
      if (!projectId) return json(res, 400, { error: 'Missing ?project= parameter' })
      // A repo root id answers for all of its member working dirs, so one
      // repo reads as one history; any other project id serves just itself.
      const repo = knownRepos(claudeDir, stores).find((r) => r.id === projectId)
      if (repo) return json(res, 200, listRepoSessions(claudeDir, repo))
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
    if (route === '/api/models' && method === 'GET') {
      return json(res, 200, { models: await listRecentModels(claudeDir), efforts: EFFORT_LEVELS })
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
        effort: body.effort || null,
        enabled: body.enabled !== false,
        nextRun: nextRunTime(body.schedule),
        lastRun: null,
        webhookToken: randomBytes(16).toString('hex'),
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
          effort: routine.effort,
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
        effort: body.effort || null,
        isolation: body.isolation === 'worktree' ? 'worktree' : null,
      })
      return json(res, 201, run)
    }
    const runMatch = route.match(/^\/api\/runs\/([\w-]+)(\/log|\/stop|\/approve|\/deny|\/apply|\/discard|\/diff)?$/)
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
      if (runMatch[2] === '/approve' && method === 'POST') {
        return json(res, 200, approveRun(stores, run.id))
      }
      if (runMatch[2] === '/deny' && method === 'POST') {
        return json(res, 200, denyRun(stores, run.id))
      }
      if (runMatch[2] === '/apply' && method === 'POST') {
        return json(res, 200, await applyCleanRoom(stores, run))
      }
      if (runMatch[2] === '/discard' && method === 'POST') {
        return json(res, 200, await discardCleanRoom(stores, run))
      }
      if (runMatch[2] === '/diff' && method === 'GET') {
        if (!run.cleanRoom) return json(res, 404, { error: 'Run has no clean room' })
        const patch = await cleanRoomPatch(run.projectPath, run.cleanRoom)
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end(patch)
      }
    }

    // ---------- recall (search across every session) ----------
    if (route === '/api/recall' && method === 'GET') {
      return json(res, 200, await recall.search(url.searchParams.get('q') || ''))
    }

    // ---------- manifests (intents-as-code; adoption is explicit) ----------
    if (route === '/api/manifests' && method === 'GET') {
      const statuses = []
      for (const repo of knownRepos(claudeDir, stores)) {
        const status = manifestStatus(stores, repo.path, BUILTINS)
        if (status.present || status.adopted) statuses.push({ path: repo.path, ...status })
      }
      return json(res, 200, statuses)
    }
    if (route === '/api/manifest/adopt' && method === 'POST') {
      const body = await readBody(req)
      if (!body.path) return json(res, 400, { error: 'path is required' })
      return json(res, 200, adoptManifest(stores, body.path, BUILTINS))
    }
    if (route === '/api/manifest/drop' && method === 'POST') {
      const body = await readBody(req)
      if (!body.path) return json(res, 400, { error: 'path is required' })
      return json(res, 200, dropManifest(stores, body.path))
    }
    if (route === '/api/manifest/export' && method === 'POST') {
      const body = await readBody(req)
      if (!body.path) return json(res, 400, { error: 'path is required' })
      return json(res, 200, { file: writeManifest(stores, body.path) })
    }

    // ---------- settings & notifications ----------
    if (route === '/api/budget' && method === 'GET') {
      const settings = getSettings(stores)
      return json(res, 200, {
        spend: spendReport(stores),
        monthlyBudgetUsd: Number(settings.monthlyBudgetUsd) || 0,
        repoBudgetsUsd: settings.repoBudgetsUsd || {},
        maxConcurrentRuns: Number(settings.maxConcurrentRuns) || 2,
        maxRunsPerDay: Number(settings.maxRunsPerDay) || 6,
        maxFailStreak: Number(settings.maxFailStreak) || 2,
      })
    }
    if (route === '/api/settings' && method === 'GET') {
      return json(res, 200, getSettings(stores))
    }
    if (route === '/api/settings' && method === 'PUT') {
      const body = await readBody(req)
      return json(res, 200, updateSettings(stores, body))
    }
    if (route === '/api/notify/test' && method === 'POST') {
      const results = await sendNotification(stores, {
        title: 'Test notification',
        body: 'Basecamp can reach you here.',
      })
      return json(res, 200, { results })
    }

    // ---------- incoming webhooks (fire a routine from CI etc.) ----------
    const hookMatch = route.match(/^\/api\/hooks\/([\w-]+)$/)
    if (hookMatch && method === 'POST') {
      const routine = stores.routines.list().find((r) => r.webhookToken === hookMatch[1])
      if (!routine) return json(res, 404, { error: 'Unknown webhook token' })
      const run = launchRun(stores, {
        projectPath: routine.projectPath,
        prompt: routine.prompt,
        permissionMode: routine.permissionMode,
        model: routine.model,
        routineId: routine.id,
        routineName: routine.name,
      })
      stores.routines.update(routine.id, { lastRun: Date.now() })
      return json(res, 201, { ok: true, runId: run.id })
    }

    // ---------- GitHub (via gh CLI) ----------
    if (route === '/api/repo/github' && method === 'GET') {
      const path = url.searchParams.get('path')
      if (!path) return json(res, 400, { error: 'Missing ?path= parameter' })
      return json(res, 200, await repoGithub(path))
    }
    if (route === '/api/repo/issue-run' && method === 'POST') {
      const body = await readBody(req)
      if (!body.path || !body.issue) return json(res, 400, { error: 'path and issue are required' })
      const run = launchRun(stores, {
        projectPath: body.path,
        prompt: issueRunPrompt(Number(body.issue)),
        permissionMode: 'acceptEdits',
        model: body.model || 'sonnet',
      })
      return json(res, 201, run)
    }

    // ---------- intents (the reconciliation loop) ----------
    if (route === '/api/intents' && method === 'GET') {
      const project = url.searchParams.get('project')
      const intents = stores.intents.list()
      return json(res, 200, project ? intents.filter((i) => i.projectPath === project) : intents)
    }
    if (route === '/api/intents/report' && method === 'GET') {
      return json(res, 200, intentReport(stores))
    }
    if (route === '/api/intents' && method === 'POST') {
      const body = await readBody(req)
      if (!body.projectPath || !existsSync(body.projectPath)) {
        return json(res, 400, { error: 'A valid projectPath is required' })
      }
      const builtin = body.builtin || null
      if (builtin && !BUILTINS[builtin]) return json(res, 400, { error: `Unknown builtin: ${builtin}` })
      if (!builtin && !body.text?.trim()) return json(res, 400, { error: 'text is required for custom intents' })
      if (body.autonomy && !['apply', 'propose'].includes(body.autonomy)) {
        return json(res, 400, { error: 'autonomy must be "apply" or "propose"' })
      }
      const intent = stores.intents.insert({
        projectPath: body.projectPath,
        builtin,
        text: builtin ? null : String(body.text).trim(),
        label: builtin ? BUILTINS[builtin].label : String(body.text).trim().slice(0, 80),
        intervalMinutes: Math.max(Number(body.intervalMinutes) || 120, 15),
        model: body.model || null,
        // propose = converge in a clean room, hand back a diff to review.
        autonomy: body.autonomy || 'propose',
        enabled: true,
        lastCheck: null,
        lastStatus: null,
        lastDetail: null,
        lastRunId: null,
        failStreak: 0,
      })
      return json(res, 201, intent)
    }
    const intentMatch = route.match(/^\/api\/intents\/([\w-]+)(\/reconcile|\/decide)?$/)
    if (intentMatch && intentMatch[1] !== 'report') {
      const intent = stores.intents.get(intentMatch[1])
      if (!intent) return json(res, 404, { error: 'Intent not found' })
      if (intentMatch[2] === '/reconcile' && method === 'POST') {
        return json(res, 200, await reconcileIntent(stores, intent))
      }
      if (intentMatch[2] === '/decide' && method === 'POST') {
        const body = await readBody(req)
        if (!body.decision?.trim()) return json(res, 400, { error: 'decision text is required' })
        const run = launchRun(stores, {
          projectPath: intent.projectPath,
          prompt: `Standing intent: "${intent.label}"\nIt needed a human decision: ${intent.lastDetail}\n\nThe owner has decided: "${body.decision.trim()}"\n\nCarry out this decision, verify the intent holds afterwards, and commit your work with clear messages.`,
          permissionMode: 'acceptEdits',
          model: intent.model || 'sonnet',
          routineName: `Intent: ${intent.label}`,
          intentId: intent.id,
        })
        stores.intents.update(intent.id, { lastStatus: 'converging', lastRunId: run.id, failStreak: 0 })
        return json(res, 201, run)
      }
      if (method === 'PUT') {
        const body = await readBody(req)
        const allowed = {}
        if ('enabled' in body) allowed.enabled = Boolean(body.enabled)
        if ('intervalMinutes' in body) allowed.intervalMinutes = Math.max(Number(body.intervalMinutes) || 120, 15)
        if ('model' in body) allowed.model = body.model || null
        return json(res, 200, stores.intents.update(intent.id, allowed))
      }
      if (method === 'DELETE') {
        stores.intents.remove(intent.id)
        return json(res, 200, { ok: true })
      }
    }

    // ---------- immune system (reflexes) ----------
    if (route === '/api/reflex/hook' && method === 'POST') {
      // Called by the PreToolUse hook of every Claude session on this machine.
      const body = await readBody(req).catch(() => ({}))
      const verdict = reflexVerdict(stores, {
        toolName: body.tool_name,
        toolInput: body.tool_input,
      })
      bumpCounters(stores, { blocked: verdict.decision === 'deny' })
      if (verdict.decision !== 'deny') return json(res, 200, {})
      stores.updates.insert({
        kind: 'reflex-block',
        projectPath: body.cwd || null,
        title: `Reflex blocked "${(body.tool_input?.command || body.tool_input?.file_path || body.tool_name || '').toString().slice(0, 60)}"`,
        body: verdict.reason,
      })
      return json(res, 200, {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: verdict.reason,
        },
      })
    }
    if (route === '/api/reflex/scan' && method === 'POST') {
      return json(res, 200, await mineAntibodies(claudeDir, stores))
    }
    if (route === '/api/reflex/stats' && method === 'GET') {
      return json(res, 200, { ...immuneStats(stores), hookInstalled: reflexHookInstalled(claudeDir) })
    }
    if (route === '/api/reflex/antibodies' && method === 'GET') {
      return json(res, 200, stores.antibodies.list().sort((a, b) => b.count - a.count))
    }
    const antibodyMatch = route.match(/^\/api\/reflex\/antibodies\/([\w-]+)$/)
    if (antibodyMatch) {
      const antibody = stores.antibodies.get(antibodyMatch[1])
      if (!antibody) return json(res, 404, { error: 'Antibody not found' })
      if (method === 'PUT') {
        const body = await readBody(req)
        return json(res, 200, stores.antibodies.update(antibody.id, { muted: Boolean(body.muted) }))
      }
      if (method === 'DELETE') {
        stores.antibodies.remove(antibody.id)
        return json(res, 200, { ok: true })
      }
    }
    if (route === '/api/reflex/install' && method === 'POST') {
      return json(res, 200, installReflexHook(claudeDir, ctx.port))
    }
    if (route === '/api/reflex/uninstall' && method === 'POST') {
      return json(res, 200, uninstallReflexHook(claudeDir))
    }

    // ---------- session rescue ----------
    if (route === '/api/rescue' && method === 'GET') {
      return json(res, 200, await findRescueCandidates(claudeDir, stores))
    }
    if (route === '/api/rescue' && method === 'POST') {
      const body = await readBody(req)
      if (!body.sessionId || !body.projectPath) {
        return json(res, 400, { error: 'sessionId and projectPath are required' })
      }
      validateRescueTarget(claudeDir, body.projectPath)
      const run = launchRun(stores, {
        projectPath: body.projectPath,
        prompt: rescuePrompt(),
        permissionMode: 'acceptEdits',
        model: body.model || null,
        resumeSessionId: body.sessionId,
        rescuedSessionId: body.sessionId,
      })
      return json(res, 201, run)
    }

    // ---------- catalog (one-click installs) ----------
    if (route === '/api/catalog' && method === 'GET') {
      return json(res, 200, await catalogWithStatus(claudeDir))
    }
    if (route === '/api/catalog/install' && method === 'POST') {
      const body = await readBody(req)
      const catalog = await loadCatalog()
      if (body.kind === 'connector') {
        const entry = catalog.connectors.find((c) => c.id === body.id)
        if (!entry) return json(res, 404, { error: 'Unknown catalog connector' })
        return json(res, 201, addConnector(claudeDir, {
          name: entry.id,
          transport: entry.transport,
          url: entry.url,
          command: entry.command,
          args: entry.args,
        }))
      }
      if (body.kind === 'skill') {
        const entry = catalog.skills.find((s) => s.id === body.id)
        if (!entry) return json(res, 404, { error: 'Unknown catalog skill' })
        return json(res, 201, await installSkill(claudeDir, entry))
      }
      return json(res, 400, { error: 'kind must be connector or skill' })
    }
    if (route === '/api/catalog/uninstall' && method === 'POST') {
      const body = await readBody(req)
      if (body.kind === 'skill') {
        uninstallSkill(claudeDir, String(body.id || ''))
        return json(res, 200, { ok: true })
      }
      if (body.kind === 'connector') {
        removeConnector(claudeDir, String(body.id || ''))
        return json(res, 200, { ok: true })
      }
      return json(res, 400, { error: 'kind must be connector or skill' })
    }

    // ---------- connector management (explicit opt-in write) ----------
    if (route === '/api/connectors' && method === 'POST') {
      const body = await readBody(req)
      return json(res, 201, addConnector(claudeDir, body))
    }
    const connectorMatch = route.match(/^\/api\/connectors\/([\w-]+)$/)
    if (connectorMatch && method === 'DELETE') {
      removeConnector(claudeDir, connectorMatch[1])
      return json(res, 200, { ok: true })
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
      const manager = stores.managers.list().find((m) => m.projectPath === project) || null
      return json(res, 200, {
        messages: chatHistory(stores, project),
        busy: chatBusy(project),
        model: manager?.model ?? null,
        effort: manager?.effort ?? null,
        permissionMode: manager?.permissionMode ?? 'acceptEdits',
      })
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
          {
            projectPath: body.projectPath,
            message: body.message,
            port: ctx.port,
            model: body.model,
            permissionMode: body.permissionMode,
            effort: body.effort,
          },
          (event) => res.write(JSON.stringify(event) + '\n')
        )
      } catch (err) {
        res.write(JSON.stringify({ type: 'done', error: err.message }) + '\n')
      }
      return res.end()
    }

    // ---------- away digest ----------
    if (route === '/api/digest' && method === 'GET') {
      const meta = stores.managers.list().find((m) => m.key === 'lastSeen')
      const since = meta?.value || 0
      const items = stores.updates.list().filter((u) => u.createdAt > since)
      return json(res, 200, { since, items })
    }
    if (route === '/api/digest/ack' && method === 'POST') {
      const meta = stores.managers.list().find((m) => m.key === 'lastSeen')
      if (meta) stores.managers.update(meta.id, { value: Date.now() })
      else stores.managers.insert({ key: 'lastSeen', value: Date.now() })
      return json(res, 200, { ok: true })
    }

    // ---------- activity heatmap ----------
    if (route === '/api/heatmap' && method === 'GET') {
      const days = Math.min(Number(url.searchParams.get('days')) || 182, 366)
      const cutoff = Date.now() - days * 86400e3
      const counts = {}
      const bump = (ms) => {
        if (!ms || ms < cutoff) return
        const day = new Date(ms).toISOString().slice(0, 10)
        counts[day] = (counts[day] || 0) + 1
      }
      for (const project of listProjects(claudeDir)) {
        if (project.lastModified < cutoff) continue
        for (const session of listSessions(claudeDir, project.id)) bump(session.lastModified)
      }
      for (const run of stores.runs.list()) bump(run.startedAt)
      return json(res, 200, { days, counts })
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
    const status = /required|invalid|too large|does not exist|must be|already exists|no resumable session/i.test(
      err.message
    )
      ? 400
      : 500
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
  const ctx = { claudeDir, stores, port, recall: createRecall(claudeDir, stores.home) }
  startScheduler(stores)
  startReconciler(stores)

  // Backfill webhook tokens for routines created before webhooks existed.
  for (const routine of stores.routines.list()) {
    if (!routine.webhookToken) {
      stores.routines.update(routine.id, { webhookToken: randomBytes(16).toString('hex') })
    }
  }

  // Records keyed by subdirectory or worktree paths re-key to their repo
  // root, so pre-grouping managers, goals, chats, and checks stay reachable.
  normalizeStorePaths(stores)

  // Clean rooms of long-settled runs are discarded so worktrees never pile up.
  sweepCleanRooms(stores).catch(() => {})

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
