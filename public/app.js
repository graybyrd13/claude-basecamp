/* Claude Basecamp dashboard — vanilla JS, no build step. */

const state = { tab: 'overview', project: null, session: null }

const $ = (sel) => document.querySelector(sel)

const fmt = new Intl.NumberFormat()
const fmtTokens = (n) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
const fmtTime = (ms) => {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago'
  return new Date(ms).toLocaleDateString()
}
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const shortModel = (m) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')
const projectName = (p) => p.split('/').filter(Boolean).slice(-2).join('/') || p

async function api(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}

/* ---------- Overview ---------- */

async function renderOverview() {
  const el = $('#tab-overview')
  const [overview, projects] = await Promise.all([api('/api/overview'), api('/api/projects')])
  $('#claude-dir').textContent = overview.claudeDir

  const active = projects.filter((p) => p.isActive)
  el.innerHTML = `
    <div class="cards">
      <div class="card"><div class="num">${fmt.format(overview.sessionCount)}</div><div class="label">sessions</div></div>
      <div class="card"><div class="num">${fmt.format(overview.projectCount)}</div><div class="label">projects</div></div>
      <div class="card"><div class="num" style="color:${overview.activeSessions.length ? 'var(--green)' : 'inherit'}">${overview.activeSessions.length}</div><div class="label">active now</div></div>
      <div class="card"><div class="num">${overview.agentCount}</div><div class="label">agents</div></div>
      <div class="card"><div class="num">${overview.connectorCount}</div><div class="label">connectors</div></div>
    </div>
    <h2>Recent projects</h2>
    <table>
      <thead><tr><th>Project</th><th class="num">Sessions</th><th class="num">Last activity</th><th></th></tr></thead>
      <tbody>
        ${projects.slice(0, 12).map((p) => `
          <tr class="clickable" data-project="${esc(p.id)}">
            <td>${esc(projectName(p.path))}</td>
            <td class="num">${p.sessionCount}</td>
            <td class="num">${fmtTime(p.lastModified)}</td>
            <td>${p.isActive ? '<span class="badge active">● active</span>' : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${active.length === 0 && projects.length === 0 ? '<div class="empty">No Claude Code sessions found yet.</div>' : ''}
  `
  el.querySelectorAll('tr[data-project]').forEach((row) =>
    row.addEventListener('click', () => {
      state.project = row.dataset.project
      state.session = null
      switchTab('sessions')
    })
  )
}

/* ---------- Sessions ---------- */

async function renderSessions() {
  const el = $('#tab-sessions')
  const projects = await api('/api/projects')
  if (!state.project && projects.length) state.project = projects[0].id

  const options = projects
    .map((p) => `<option value="${esc(p.id)}" ${p.id === state.project ? 'selected' : ''}>${esc(projectName(p.path))}</option>`)
    .join('')

  let sessionsHtml = '<div class="empty">No sessions in this project.</div>'
  if (state.project) {
    const sessions = await api(`/api/sessions?project=${encodeURIComponent(state.project)}`)
    if (sessions.length) {
      sessionsHtml = `
        <table>
          <thead><tr><th>Session</th><th class="num">Size</th><th class="num">Last activity</th><th></th></tr></thead>
          <tbody>
            ${sessions.map((s) => `
              <tr class="clickable" data-session="${esc(s.id)}">
                <td><code>${esc(s.id.slice(0, 8))}</code></td>
                <td class="num">${(s.bytes / 1024).toFixed(0)} KB</td>
                <td class="num">${fmtTime(s.lastModified)}</td>
                <td>${s.isActive ? '<span class="badge active">● active</span>' : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
    }
  }

  el.innerHTML = `
    <label class="dim">Project: <select id="project-select">${options}</select></label>
    ${sessionsHtml}
    <div id="session-detail"></div>
  `
  $('#project-select').addEventListener('change', (e) => {
    state.project = e.target.value
    state.session = null
    renderSessions()
  })
  el.querySelectorAll('tr[data-session]').forEach((row) =>
    row.addEventListener('click', () => {
      state.session = row.dataset.session
      renderSessionDetail()
    })
  )
  if (state.session) renderSessionDetail()
}

async function renderSessionDetail() {
  const el = $('#session-detail')
  el.innerHTML = '<div class="dim" style="padding:12px">Parsing transcript…</div>'
  try {
    const s = await api(`/api/session?project=${encodeURIComponent(state.project)}&id=${encodeURIComponent(state.session)}`)
    const totalTokens = s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheCreation
    el.innerHTML = `
      <div class="detail">
        <h2 style="margin-top:0">${esc(s.title || s.id)}</h2>
        <p class="dim">${esc(s.id)} · ${s.isActive ? '<span class="badge active">● active</span>' : 'idle'} · last activity ${fmtTime(s.lastModified)}</p>
        <div class="cards" style="margin:12px 0">
          <div class="card"><div class="num">${s.userMessages}</div><div class="label">user messages</div></div>
          <div class="card"><div class="num">${s.assistantMessages}</div><div class="label">assistant messages</div></div>
          <div class="card"><div class="num">${s.toolCalls}</div><div class="label">tool calls</div></div>
          <div class="card"><div class="num">${s.subagents}</div><div class="label">subagents</div></div>
          <div class="card"><div class="num">${fmtTokens(totalTokens)}</div><div class="label">total tokens</div></div>
        </div>
        ${tokenBars(s.tokens)}
        <p style="margin-top:10px">${Object.keys(s.models).map((m) => `<span class="badge model">${esc(shortModel(m))}</span>`).join(' ')}
        ${s.slashCommands.length ? s.slashCommands.map((c) => `<span class="badge">/${esc(c.replace(/^\//, ''))}</span>`).join(' ') : ''}</p>
      </div>`
  } catch (err) {
    el.innerHTML = `<div class="empty">Failed to load session: ${esc(err.message)}</div>`
  }
}

function tokenBars(tokens) {
  const entries = [
    ['input', tokens.input],
    ['output', tokens.output],
    ['cache read', tokens.cacheRead],
    ['cache write', tokens.cacheCreation],
  ]
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return entries
    .map(
      ([label, value]) => `
      <div class="bar-row">
        <span class="bar-label">${label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${((value / max) * 100).toFixed(1)}%"></span></span>
        <span class="bar-value">${fmtTokens(value)}</span>
      </div>`
    )
    .join('')
}

/* ---------- Agents ---------- */

async function renderAgents() {
  const el = $('#tab-agents')
  const agents = await api('/api/agents')
  if (!agents.length) {
    el.innerHTML = '<div class="empty">No agents found in <code>agents/</code>.</div>'
    return
  }
  el.innerHTML = `
    <p class="dim">${agents.length} agent definition${agents.length === 1 ? '' : 's'} installed</p>
    <table>
      <thead><tr><th>Agent</th><th>Description</th><th>Model</th></tr></thead>
      <tbody>
        ${agents.map((a) => `
          <tr>
            <td><strong>${esc(a.name)}</strong></td>
            <td class="dim">${esc((a.description || '').slice(0, 140))}</td>
            <td>${a.model ? `<span class="badge model">${esc(a.model)}</span>` : '<span class="dim">inherit</span>'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`
}

/* ---------- Usage ---------- */

async function renderUsage() {
  const el = $('#tab-usage')
  el.innerHTML = '<div class="dim" style="padding:12px">Crunching transcripts (cached after first run)…</div>'
  const u = await api('/api/usage')
  const total = u.totals.input + u.totals.output + u.totals.cacheRead + u.totals.cacheCreation

  const days = Object.entries(u.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
  const maxDay = Math.max(...days.map(([, t]) => t.input + t.output + t.cacheRead + t.cacheCreation), 1)

  el.innerHTML = `
    <p class="dim">Last ${u.windowDays} days · ${u.scannedSessions} sessions scanned${u.truncated ? ` <span class="badge warn">capped at ${u.scannedSessions} of ${u.totalCandidates}</span>` : ''}</p>
    <div class="cards">
      <div class="card"><div class="num">${fmtTokens(total)}</div><div class="label">total tokens</div></div>
      <div class="card"><div class="num">${fmtTokens(u.totals.output)}</div><div class="label">output</div></div>
      <div class="card"><div class="num">${fmtTokens(u.totals.input)}</div><div class="label">input</div></div>
      <div class="card"><div class="num">${fmtTokens(u.totals.cacheRead)}</div><div class="label">cache read</div></div>
    </div>
    <h2>Daily activity</h2>
    ${days.map(([day, t]) => {
      const dayTotal = t.input + t.output + t.cacheRead + t.cacheCreation
      return `
      <div class="bar-row">
        <span class="bar-label">${day.slice(5)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${((dayTotal / maxDay) * 100).toFixed(1)}%"></span></span>
        <span class="bar-value">${fmtTokens(dayTotal)}</span>
      </div>`
    }).join('')}
    <h2>Top sessions by output</h2>
    <table>
      <thead><tr><th>Session</th><th class="num">Output</th><th class="num">Cache read</th><th class="num">Tool calls</th></tr></thead>
      <tbody>
        ${u.topSessions.map((s) => `
          <tr>
            <td>${esc((s.title || s.id).slice(0, 70))}</td>
            <td class="num">${fmtTokens(s.tokens.output)}</td>
            <td class="num">${fmtTokens(s.tokens.cacheRead)}</td>
            <td class="num">${s.toolCalls}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${u.graphifyCandidates.length ? `
      <h2>🔗 Graphify candidates</h2>
      <p class="dim">Sessions with heavy context re-reads — converting their knowledge to a graph would cut repeated token costs.</p>
      <table>
        <thead><tr><th>Session</th><th class="num">Cache read</th></tr></thead>
        <tbody>
          ${u.graphifyCandidates.map((s) => `
            <tr><td>${esc((s.title || s.id).slice(0, 70))}</td><td class="num">${fmtTokens(s.tokens.cacheRead)}</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
  `
}

/* ---------- Connectors ---------- */

async function renderConnectors() {
  const el = $('#tab-connectors')
  const { connectors, plugins } = await api('/api/connectors')
  el.innerHTML = `
    <p class="dim">MCP servers and extensions discovered across your Claude configuration. Manage them with <code>claude mcp</code> or <code>/mcp</code> in a session.</p>
    ${connectors.length ? `
      <table>
        <thead><tr><th>Connector</th><th>Transport</th><th>Scope</th><th>Source</th></tr></thead>
        <tbody>
          ${connectors.map((c) => `
            <tr>
              <td><strong>${esc(c.name)}</strong></td>
              <td><span class="badge">${esc(c.transport)}</span></td>
              <td class="dim">${esc(c.scope.startsWith('project:') ? projectName(c.scope.slice(8)) : c.scope)}</td>
              <td class="dim">${esc(c.url || c.command || '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty">No MCP connectors configured.</div>'}
    ${plugins.length ? `
      <h2>Plugins</h2>
      <table>
        <thead><tr><th>Plugin</th><th>Status</th></tr></thead>
        <tbody>
          ${plugins.map((p) => `
            <tr><td>${esc(p.name)}</td><td>${p.enabled ? '<span class="badge active">enabled</span>' : '<span class="badge">disabled</span>'}</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
  `
}

/* ---------- Tab wiring + refresh loop ---------- */

const renderers = {
  overview: renderOverview,
  sessions: renderSessions,
  agents: renderAgents,
  usage: renderUsage,
  connectors: renderConnectors,
}

function switchTab(tab) {
  state.tab = tab
  document.querySelectorAll('nav#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${tab}`))
  render()
}

function render() {
  renderers[state.tab]().catch((err) => {
    $(`#tab-${state.tab}`).innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`
  })
}

document.querySelectorAll('nav#tabs button').forEach((b) =>
  b.addEventListener('click', () => switchTab(b.dataset.tab))
)

render()
setInterval(() => {
  // Live-refresh the cheap tabs; usage recomputes only on demand.
  if (state.tab === 'overview' || state.tab === 'sessions') render()
}, 5000)
