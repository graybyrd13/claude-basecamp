/* Claude Basecamp — vanilla JS app, no build step. */

const state = {
  page: 'home',
  hqProject: null,
  statsTab: 'usage',
  project: null,
  runId: null,
  chatBusy: false,
}

const $ = (sel) => document.querySelector(sel)
const main = $('#main')

/* ---------- helpers ---------- */

const fmt = new Intl.NumberFormat()
const fmtTokens = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(n ?? 0)
}
const fmtTime = (ms) => {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 60e3) return 'just now'
  if (diff < 3600e3) return Math.floor(diff / 60e3) + 'm ago'
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + 'h ago'
  return new Date(ms).toLocaleDateString()
}
const fmtUntil = (ms) => {
  if (!ms) return '—'
  const diff = ms - Date.now()
  if (diff <= 0) return 'due now'
  if (diff < 3600e3) return 'in ' + Math.ceil(diff / 60e3) + 'm'
  if (diff < 86400e3) return 'in ' + Math.round(diff / 3600e3) + 'h'
  return new Date(ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
const fmtDuration = (start, end) => {
  if (!start) return '—'
  const s = Math.round(((end || Date.now()) - start) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const projName = (p) => String(p || '').split('/').filter(Boolean).pop() || p
const shortModel = (m) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')

/** Minimal markdown: code blocks, inline code, bold, links. Input is escaped first. */
function md(text) {
  let html = esc(text)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre>${code}</pre>`)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
  return html
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

const statusBadge = (status) =>
  ({
    running: '<span class="badge green"><span class="pulse-dot" style="width:7px;height:7px"></span>running</span>',
    succeeded: '<span class="badge green">✓ done</span>',
    failed: '<span class="badge red">✕ failed</span>',
    stopped: '<span class="badge">■ stopped</span>',
  })[status] || `<span class="badge">${esc(status)}</span>`

/* ---------- modal ---------- */

function openModal(html) {
  $('#modal').innerHTML = html
  $('#modal-backdrop').classList.remove('hidden')
}
function closeModal() {
  $('#modal-backdrop').classList.add('hidden')
}
$('#modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal()
})

function projectOptions(projects, selected) {
  return projects
    .filter((p) => p.exists)
    .map((p) => `<option value="${esc(p.path)}" ${p.path === selected ? 'selected' : ''}>${esc(projName(p.path))} — ${esc(p.path)}</option>`)
    .join('')
}

const PERMISSION_OPTIONS = `
  <option value="acceptEdits">Accept edits (recommended)</option>
  <option value="plan">Plan only (read-only)</option>
  <option value="default">Default (may stall on prompts)</option>
  <option value="bypassPermissions">Bypass permissions (unattended, trusted repos)</option>`

const MODEL_OPTIONS = `
  <option value="sonnet">Sonnet (recommended for background work)</option>
  <option value="haiku">Haiku (fastest, cheapest)</option>
  <option value="opus">Opus (deepest reasoning)</option>
  <option value="">Your Claude Code default</option>`

const modelPermissionFields = () => `
  <div class="field-row">
    <label class="field">Model
      <select name="model">${MODEL_OPTIONS}</select>
    </label>
    <label class="field">Permissions
      <select name="permissionMode">${PERMISSION_OPTIONS}</select>
    </label>
  </div>`

async function openTaskModal(projectPath = null, presetPrompt = '') {
  const projects = await api('/api/projects')
  openModal(`
    <h2>Run a background task</h2>
    <form id="task-form">
      <label class="field">Project
        <select name="projectPath">${projectOptions(projects, projectPath)}</select>
      </label>
      <label class="field">What should Claude do?
        <textarea name="prompt" required placeholder="e.g. Review TODO.md and continue development on the next unchecked item. Run the tests, and commit your work when they pass.">${esc(presetPrompt)}</textarea>
      </label>
      ${modelPermissionFields()}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">▶ Run now</button>
      </div>
    </form>`)
  wireModalForm('#task-form', async (fields) => {
    await api('/api/runs', { method: 'POST', body: { ...fields, model: fields.model || null } })
    go('runs')
  })
}

async function openRoutineModal(routine = null, presetProject = null) {
  const projects = await api('/api/projects')
  const s = routine?.schedule || {}
  openModal(`
    <h2>${routine ? 'Edit routine' : 'New routine'}</h2>
    <form id="routine-form">
      <label class="field">Name
        <input name="name" value="${esc(routine?.name || '')}" placeholder="Morning progress push" required />
      </label>
      <label class="field">Project
        <select name="projectPath">${projectOptions(projects, routine?.projectPath || presetProject)}</select>
      </label>
      <label class="field">Prompt
        <textarea name="prompt" required placeholder="Summarize what changed since the last run, then continue development on the highest-priority open task. Commit your work.">${esc(routine?.prompt || '')}</textarea>
      </label>
      <div class="field-row">
        <label class="field">Repeats
          <select name="scheduleType" id="schedule-type">
            <option value="interval" ${s.type === 'interval' ? 'selected' : ''}>Every N minutes</option>
            <option value="daily" ${s.type === 'daily' || !s.type ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${s.type === 'weekly' ? 'selected' : ''}>Weekly</option>
          </select>
        </label>
        <label class="field" data-sched="interval">Minutes
          <input name="minutes" type="number" min="5" value="${esc(s.minutes || 120)}" />
        </label>
        <label class="field" data-sched="daily weekly">Time
          <input name="time" type="time" value="${esc(s.time || '09:00')}" />
        </label>
        <label class="field" data-sched="weekly">Day
          <select name="day">
            ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
              .map((d, i) => `<option value="${i}" ${Number(s.day) === i ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </label>
      </div>
      ${modelPermissionFields()}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${routine ? 'Save' : 'Create routine'}</button>
      </div>
    </form>`)
  if (routine?.permissionMode) $('#routine-form [name=permissionMode]').value = routine.permissionMode
  if (routine) $('#routine-form [name=model]').value = routine.model || ''
  const syncScheduleFields = () => {
    const type = $('#schedule-type').value
    document.querySelectorAll('[data-sched]').forEach((el) => {
      el.classList.toggle('hidden', !el.dataset.sched.split(' ').includes(type))
    })
  }
  $('#schedule-type').addEventListener('change', syncScheduleFields)
  syncScheduleFields()

  wireModalForm('#routine-form', async (fields) => {
    const schedule =
      fields.scheduleType === 'interval'
        ? { type: 'interval', minutes: Number(fields.minutes) }
        : fields.scheduleType === 'daily'
          ? { type: 'daily', time: fields.time }
          : { type: 'weekly', day: Number(fields.day), time: fields.time }
    const body = {
      name: fields.name,
      projectPath: fields.projectPath,
      prompt: fields.prompt,
      permissionMode: fields.permissionMode,
      model: fields.model || null,
      schedule,
    }
    if (routine) await api(`/api/routines/${routine.id}`, { method: 'PUT', body })
    else await api('/api/routines', { method: 'POST', body })
    render()
  })
}

function wireModalForm(selector, onSubmit) {
  const form = $(selector)
  form.querySelector('[data-close]')?.addEventListener('click', closeModal)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fields = Object.fromEntries(new FormData(form).entries())
    const submit = form.querySelector('[type=submit]')
    submit.disabled = true
    try {
      await onSubmit(fields)
      closeModal()
    } catch (err) {
      submit.disabled = false
      alert(err.message)
    }
  })
}

/* ---------- Project HQ (manager chat) ---------- */

async function renderHQ() {
  const path = state.hqProject
  main.innerHTML = `
    <div class="hq">
      <div class="hq-head">
        <h1>${esc(projName(path))}</h1>
        <span class="path">${esc(path)}</span>
        <span id="hq-live"></span>
        <span style="flex:1"></span>
        <button class="btn small" id="hq-run-task">▶ Background task</button>
      </div>
      <div class="hq-body">
        <div class="chat-col">
          <div class="chat-scroll" id="chat-scroll">
            <div class="chat-thread" id="chat-thread"><div class="empty">Loading…</div></div>
          </div>
          <div class="composer">
            <div class="composer-inner">
              <textarea id="chat-input" rows="1" placeholder="Ask your manager — “run the tests every night at 9”, “add a goal to ship v1”, “what's the state of this project?”"></textarea>
              <button class="btn primary" id="chat-send">Send</button>
            </div>
            <div class="hint">The manager works inside this project with full Claude Code tools, and can schedule routines, track goals, launch runs, and configure hooks.</div>
          </div>
        </div>
        <div class="hq-rail" id="hq-rail"></div>
      </div>
    </div>`

  $('#hq-run-task').addEventListener('click', () => openTaskModal(path))
  const input = $('#chat-input')
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
  })
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 160) + 'px'
  })
  $('#chat-send').addEventListener('click', sendChat)

  await Promise.all([loadChatHistory(), renderHQRail()])
  input.focus()
}

function chatBubble(role, html) {
  return `<div class="msg ${role}">
    <div class="who">${role === 'user' ? 'you' : '⛺ manager'}</div>
    <div class="bubble">${html}</div>
  </div>`
}

async function loadChatHistory() {
  const thread = $('#chat-thread')
  try {
    const { messages, busy } = await api(`/api/chat/history?project=${encodeURIComponent(state.hqProject)}`)
    state.chatBusy = busy
    if (!messages.length) {
      thread.innerHTML = `
        <div class="empty">
          <div style="font-size:34px;margin-bottom:10px">⛺</div>
          This is your project manager for <strong>${esc(projName(state.hqProject))}</strong>.<br/>
          It remembers everything across sessions. Try:<br/><br/>
          <em>“Set up a routine to run the tests every morning and fix failures.”</em><br/>
          <em>“Our goal is to ship v1 by end of month — track it.”</em><br/>
          <em>“What changed in this repo this week?”</em>
        </div>`
      return
    }
    thread.innerHTML = messages.map((m) => chatBubble(m.role, md(m.text))).join('')
    scrollChat()
  } catch (err) {
    thread.innerHTML = `<div class="empty">${esc(err.message)}</div>`
  }
}

function scrollChat() {
  const scroller = $('#chat-scroll')
  if (scroller) scroller.scrollTop = scroller.scrollHeight
}

async function sendChat() {
  const input = $('#chat-input')
  const message = input.value.trim()
  if (!message || state.chatBusy) return
  state.chatBusy = true
  input.value = ''
  input.style.height = 'auto'
  $('#chat-send').disabled = true

  const thread = $('#chat-thread')
  if (thread.querySelector('.empty')) thread.innerHTML = ''
  thread.insertAdjacentHTML('beforeend', chatBubble('user', md(message)))
  thread.insertAdjacentHTML('beforeend', '<div class="thinking" id="thinking"><span></span><span></span><span></span></div>')
  scrollChat()

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: state.hqProject, message }),
    })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        handleChatEvent(event)
      }
    }
  } catch (err) {
    handleChatEvent({ type: 'text', text: `⚠️ ${err.message}` })
  }
  $('#thinking')?.remove()
  state.chatBusy = false
  $('#chat-send').disabled = false
  renderHQRail() // manager may have created goals/routines/runs
}

function handleChatEvent(event) {
  const thread = $('#chat-thread')
  if (!thread) return
  $('#thinking')?.remove()
  if (event.type === 'text') {
    thread.insertAdjacentHTML('beforeend', chatBubble('assistant', md(event.text)))
  }
  if (event.type === 'tool') {
    thread.insertAdjacentHTML(
      'beforeend',
      `<div class="tool-chip"><span class="tname">${esc(event.name)}</span>${event.detail ? ` ${esc(event.detail)}` : ''}</div>`
    )
  }
  if (event.type !== 'done') {
    thread.insertAdjacentHTML('beforeend', '<div class="thinking" id="thinking"><span></span><span></span><span></span></div>')
  }
  if (event.type === 'done' && event.error && !thread.textContent.includes(event.error)) {
    thread.insertAdjacentHTML('beforeend', chatBubble('assistant', md(`⚠️ ${event.error}`)))
  }
  scrollChat()
}

async function renderHQRail() {
  const rail = $('#hq-rail')
  if (!rail) return
  const path = state.hqProject
  const [goals, routines, runs] = await Promise.all([
    api(`/api/goals?project=${encodeURIComponent(path)}`),
    api('/api/routines'),
    api('/api/runs'),
  ])
  const projRoutines = routines.filter((r) => r.projectPath === path)
  const projRuns = runs.filter((r) => r.projectPath === path).slice(0, 5)
  const open = goals.filter((g) => g.status === 'open')
  const done = goals.filter((g) => g.status === 'done').slice(0, 3)

  rail.innerHTML = `
    <h2>Goals</h2>
    ${open.concat(done).map((g) => `
      <div class="rail-item ${g.status === 'done' ? 'goal-done' : ''}">
        <div class="t"><span><span class="goal-check" data-goal="${g.id}" data-status="${g.status}">${g.status === 'done' ? '☑' : '☐'}</span> ${esc(g.title)}</span></div>
        ${g.notes ? `<div class="s">${esc(g.notes)}</div>` : ''}
      </div>`).join('') || '<div class="dim" style="font-size:12px">None yet — tell the manager what you\'re driving toward.</div>'}

    <h2>Routines</h2>
    ${projRoutines.map((r) => `
      <div class="rail-item">
        <div class="t"><span>${esc(r.name)}</span>${r.enabled ? `<span class="badge accent">${esc(fmtUntil(r.nextRun))}</span>` : '<span class="badge">paused</span>'}</div>
        <div class="s">${esc(r.scheduleLabel)}</div>
      </div>`).join('') || '<div class="dim" style="font-size:12px">None yet — ask the manager to schedule one.</div>'}

    <h2>Recent runs</h2>
    ${projRuns.map((r) => `
      <div class="rail-item">
        <div class="t"><span>${esc((r.routineName || r.prompt).slice(0, 34))}</span>${statusBadge(r.status)}</div>
        <div class="s">${fmtTime(r.startedAt)}${r.costUsd ? ` · $${r.costUsd.toFixed(2)}` : ''}</div>
      </div>`).join('') || '<div class="dim" style="font-size:12px">No background runs yet.</div>'}
  `
  rail.querySelectorAll('[data-goal]').forEach((el) =>
    el.addEventListener('click', async () => {
      await api(`/api/goals/${el.dataset.goal}`, {
        method: 'PUT',
        body: { status: el.dataset.status === 'done' ? 'open' : 'done' },
      })
      renderHQRail()
    })
  )
}

/* ---------- Home ---------- */

async function renderHome() {
  const [overview, updates, runs, routines, projects] = await Promise.all([
    api('/api/overview'),
    api('/api/updates'),
    api('/api/runs'),
    api('/api/routines'),
    api('/api/projects'),
  ])
  const running = runs.filter((r) => r.status === 'running')
  const upcoming = routines
    .filter((r) => r.enabled && r.nextRun)
    .sort((a, b) => a.nextRun - b.nextRun)
    .slice(0, 3)
  const recent = projects.filter((p) => p.exists).slice(0, 4)
  const hour = new Date().getHours()

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1>
          <p class="subtitle">${overview.activeSessions.length} live session${overview.activeSessions.length === 1 ? '' : 's'} · ${running.length} background run${running.length === 1 ? '' : 's'} · ${routines.filter((r) => r.enabled).length} routine${routines.filter((r) => r.enabled).length === 1 ? '' : 's'} armed</p>
        </div>
        <button class="btn primary" id="new-task">▶ Run a task</button>
      </div>

      ${recent.length ? `
        <h2>Talk to a manager</h2>
        <div class="project-grid">
          ${recent.map((p) => `
            <div class="project-card" data-hq="${esc(p.path)}">
              <div class="name">💬 ${esc(projName(p.path))} ${p.isActive ? '<span class="badge green">● live</span>' : ''}</div>
              <div class="meta">${p.sessionCount} sessions · ${fmtTime(p.lastModified)}</div>
            </div>`).join('')}
        </div>` : ''}

      ${running.length ? `
        <h2>Running now</h2>
        <div class="panel tight">
          <table><tbody>
            ${running.map((r) => `
              <tr class="clickable" data-run="${r.id}">
                <td><strong>${esc(r.routineName || projName(r.projectPath))}</strong><div class="dim mono">${esc(r.prompt.slice(0, 90))}</div></td>
                <td class="num dim">${fmtDuration(r.startedAt)}</td>
                <td class="num">${statusBadge(r.status)}</td>
              </tr>`).join('')}
          </tbody></table>
        </div>` : ''}

      ${upcoming.length ? `
        <h2>Up next</h2>
        <div class="panel tight">
          <table><tbody>
            ${upcoming.map((r) => `
              <tr>
                <td><strong>${esc(r.name)}</strong> <span class="dim">· ${esc(projName(r.projectPath))}</span></td>
                <td class="num"><span class="badge accent">${esc(fmtUntil(r.nextRun))}</span></td>
              </tr>`).join('')}
          </tbody></table>
        </div>` : ''}

      <h2>Updates</h2>
      ${updates.length ? `
        <div class="panel">
          ${updates.slice(0, 25).map((u) => `
            <div class="feed-item">
              <div class="feed-icon ${u.kind === 'run-succeeded' ? 'ok' : u.kind === 'run-failed' ? 'fail' : ''}">${u.kind === 'run-succeeded' ? '✓' : u.kind === 'run-failed' ? '✕' : '•'}</div>
              <div class="feed-body">
                <div class="feed-title">${esc(u.title)}</div>
                ${u.body ? `<div class="feed-text">${esc(u.body)}</div>` : ''}
                <div class="feed-meta">${fmtTime(u.createdAt)}${u.costUsd ? ` · $${u.costUsd.toFixed(2)}` : ''}${u.runId ? ` · <a href="#" data-run-link="${u.runId}">view run</a>` : ''}</div>
              </div>
            </div>`).join('')}
        </div>` : `
        <div class="panel empty">
          Nothing yet. Updates appear when routines fire and background runs finish —<br/>
          Basecamp keeps your projects moving and reports back, even while you're away.
        </div>`}
    </div>`

  $('#new-task')?.addEventListener('click', () => openTaskModal())
  main.querySelectorAll('[data-hq]').forEach((el) =>
    el.addEventListener('click', () => openHQ(el.dataset.hq))
  )
  main.querySelectorAll('[data-run]').forEach((el) =>
    el.addEventListener('click', () => { state.runId = el.dataset.run; go('runs') })
  )
  main.querySelectorAll('[data-run-link]').forEach((el) =>
    el.addEventListener('click', (e) => { e.preventDefault(); state.runId = el.dataset.runLink; go('runs') })
  )
}

/* ---------- Projects ---------- */

async function renderProjects() {
  const projects = await api('/api/projects')
  const existing = projects.filter((p) => p.exists)
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Projects</h1><p class="subtitle">Open a project to talk to its manager — plan, automate, and keep it moving.</p></div>
      </div>
      <div class="project-grid">
        ${existing.map((p) => `
          <div class="project-card" data-hq="${esc(p.path)}">
            <div class="name">${esc(projName(p.path))} ${p.isActive ? '<span class="badge green">● live</span>' : ''}</div>
            <div class="path">${esc(p.path)}</div>
            <div class="meta">${p.sessionCount} session${p.sessionCount === 1 ? '' : 's'} · last activity ${fmtTime(p.lastModified)}</div>
          </div>`).join('')}
      </div>
      ${existing.length === 0 ? '<div class="empty">No projects found. Run Claude Code in a project first.</div>' : ''}
    </div>`
  main.querySelectorAll('[data-hq]').forEach((el) =>
    el.addEventListener('click', () => openHQ(el.dataset.hq))
  )
}

/* ---------- Routines ---------- */

async function renderRoutines() {
  const routines = await api('/api/routines')
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Routines</h1><p class="subtitle">Scheduled prompts that run Claude Code automatically. Your managers can create these too — just ask.</p></div>
        <button class="btn primary" id="new-routine">＋ New routine</button>
      </div>
      ${routines.length ? `
        <div class="panel tight">
          <table>
            <thead><tr><th>Routine</th><th>Schedule</th><th>Next run</th><th></th></tr></thead>
            <tbody>
              ${routines.map((r) => `
                <tr>
                  <td>
                    <strong>${esc(r.name)}</strong> <span class="dim">· ${esc(projName(r.projectPath))}</span>
                    <div class="dim mono" style="margin-top:2px">${esc(r.prompt.slice(0, 100))}${r.prompt.length > 100 ? '…' : ''}</div>
                  </td>
                  <td><span class="badge blue">${esc(r.scheduleLabel)}</span></td>
                  <td>${r.enabled ? `<span class="badge accent">${esc(fmtUntil(r.nextRun))}</span>` : '<span class="badge">paused</span>'}</td>
                  <td class="num" style="white-space:nowrap">
                    <button class="btn small" data-fire="${r.id}" title="Run now">▶</button>
                    <button class="btn small" data-toggle="${r.id}">${r.enabled ? 'Pause' : 'Resume'}</button>
                    <button class="btn small" data-edit="${r.id}">Edit</button>
                    <button class="btn small danger" data-del="${r.id}">✕</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="panel empty">
          No routines yet. Create one here, or just tell a project manager:<br/><br/>
          <em>“Every morning at 9, run the tests and fix anything that fails.”</em><br/>
          <em>“Every Monday, triage open issues and draft a weekly plan.”</em>
        </div>`}
    </div>`
  $('#new-routine')?.addEventListener('click', () => openRoutineModal())
  main.querySelectorAll('[data-fire]').forEach((el) =>
    el.addEventListener('click', async () => {
      await api(`/api/routines/${el.dataset.fire}/run`, { method: 'POST' })
      go('runs')
    })
  )
  main.querySelectorAll('[data-toggle]').forEach((el) =>
    el.addEventListener('click', async () => {
      const routine = routines.find((r) => r.id === el.dataset.toggle)
      await api(`/api/routines/${routine.id}`, { method: 'PUT', body: { enabled: !routine.enabled } })
      renderRoutines()
    })
  )
  main.querySelectorAll('[data-edit]').forEach((el) =>
    el.addEventListener('click', () => openRoutineModal(routines.find((r) => r.id === el.dataset.edit)))
  )
  main.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Delete this routine?')) return
      await api(`/api/routines/${el.dataset.del}`, { method: 'DELETE' })
      renderRoutines()
    })
  )
}

/* ---------- Runs ---------- */

async function renderRuns() {
  const runs = await api('/api/runs')
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Runs</h1><p class="subtitle">Background Claude Code executions — from routines, managers, and one-off tasks.</p></div>
        <button class="btn primary" id="new-task">▶ Run a task</button>
      </div>
      ${runs.length ? `
        <div class="panel tight">
          <table>
            <thead><tr><th>Run</th><th>Status</th><th class="num">Duration</th><th class="num">Cost</th><th></th></tr></thead>
            <tbody>
              ${runs.slice(0, 40).map((r) => `
                <tr class="clickable" data-run="${r.id}">
                  <td>
                    <strong>${esc(r.routineName || projName(r.projectPath))}</strong>
                    <span class="dim">· ${fmtTime(r.startedAt)}</span>
                    <div class="dim mono" style="margin-top:2px">${esc(r.prompt.slice(0, 100))}</div>
                  </td>
                  <td>${statusBadge(r.status)}</td>
                  <td class="num dim">${fmtDuration(r.startedAt, r.endedAt)}</td>
                  <td class="num dim">${r.costUsd ? '$' + r.costUsd.toFixed(2) : '—'}</td>
                  <td class="num">${r.status === 'running' ? `<button class="btn small danger" data-stop="${r.id}">Stop</button>` : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<div class="panel empty">No runs yet.</div>'}
      <div id="run-detail"></div>
    </div>`
  $('#new-task')?.addEventListener('click', () => openTaskModal())
  main.querySelectorAll('[data-stop]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      await api(`/api/runs/${el.dataset.stop}/stop`, { method: 'POST' })
      renderRuns()
    })
  )
  main.querySelectorAll('[data-run]').forEach((el) =>
    el.addEventListener('click', () => { state.runId = el.dataset.run; renderRunDetail() })
  )
  if (state.runId) renderRunDetail()
}

async function renderRunDetail() {
  const el = $('#run-detail')
  if (!el || !state.runId) return
  try {
    const [run, logData] = await Promise.all([
      api(`/api/runs/${state.runId}`),
      api(`/api/runs/${state.runId}/log`),
    ])
    el.innerHTML = `
      <h2>Run detail</h2>
      <div class="panel">
        <p><strong>${esc(run.routineName || projName(run.projectPath))}</strong> ${statusBadge(run.status)}</p>
        <p class="dim mono" style="margin:6px 0">${esc(run.projectPath)}</p>
        <p class="mono" style="margin:6px 0;color:var(--text-secondary)">${esc(run.prompt)}</p>
        ${run.resultText ? `<div class="panel" style="margin-top:10px;background:var(--bg-raised)"><div class="feed-text" style="-webkit-line-clamp:99">${esc(run.resultText)}</div></div>` : ''}
        <p class="dim" style="font-size:12px;margin-top:8px">
          ${fmtDuration(run.startedAt, run.endedAt)}${run.numTurns ? ` · ${run.numTurns} turns` : ''}${run.costUsd ? ` · $${run.costUsd.toFixed(2)}` : ''}${run.error ? ` · <span style="color:var(--red)">${esc(run.error)}</span>` : ''}
        </p>
      </div>
      ${logData.log ? `<div class="log-view">${esc(logData.log)}</div>` : ''}
    `
    if (run.status === 'running') {
      clearTimeout(renderRunDetail._timer)
      renderRunDetail._timer = setTimeout(() => state.page === 'runs' && renderRunDetail(), 3000)
    }
  } catch (err) {
    el.innerHTML = `<div class="empty">${esc(err.message)}</div>`
  }
}

/* ---------- Stats ---------- */

async function renderStats() {
  main.innerHTML = `
    <div class="page">
      <h1>Stats</h1>
      <p class="subtitle">Everything Claude Code has done on this machine.</p>
      <div id="stats-cards"></div>
      <div class="stats-tabs">
        ${['usage', 'sessions', 'agents', 'connectors'].map((t) =>
          `<button data-stats-tab="${t}" class="${state.statsTab === t ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>
      <div id="stats-body"><div class="empty">Loading…</div></div>
    </div>`
  main.querySelectorAll('[data-stats-tab]').forEach((b) =>
    b.addEventListener('click', () => { state.statsTab = b.dataset.statsTab; renderStats() })
  )
  api('/api/overview').then((o) => {
    const el = $('#stats-cards')
    if (!el) return
    el.innerHTML = `
      <div class="cards">
        <div class="card"><div class="num">${fmt.format(o.sessionCount)}</div><div class="label">sessions</div></div>
        <div class="card"><div class="num">${fmt.format(o.projectCount)}</div><div class="label">projects</div></div>
        <div class="card"><div class="num" style="color:${o.activeSessions.length ? 'var(--green)' : 'inherit'}">${o.activeSessions.length}</div><div class="label">active now</div></div>
        <div class="card"><div class="num">${o.agentCount}</div><div class="label">agents</div></div>
        <div class="card"><div class="num">${o.connectorCount}</div><div class="label">connectors</div></div>
      </div>`
  })
  const body = $('#stats-body')
  const renderers = {
    usage: renderStatsUsage,
    sessions: renderStatsSessions,
    agents: renderStatsAgents,
    connectors: renderStatsConnectors,
  }
  renderers[state.statsTab](body).catch((err) => {
    body.innerHTML = `<div class="empty">${esc(err.message)}</div>`
  })
}

function tokenBars(entries) {
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return entries.map(([label, value]) => `
    <div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${((value / max) * 100).toFixed(1)}%"></span></span>
      <span class="bar-value">${fmtTokens(value)}</span>
    </div>`).join('')
}

async function renderStatsUsage(body) {
  body.innerHTML = '<div class="empty">Crunching transcripts…</div>'
  const u = await api('/api/usage')
  const total = u.totals.input + u.totals.output + u.totals.cacheRead + u.totals.cacheCreation
  const days = Object.entries(u.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
  body.innerHTML = `
    <div class="cards">
      <div class="card"><div class="num">${fmtTokens(total)}</div><div class="label">total tokens · ${u.windowDays}d</div></div>
      <div class="card"><div class="num">${fmtTokens(u.totals.output)}</div><div class="label">output</div></div>
      <div class="card"><div class="num">${fmtTokens(u.totals.input)}</div><div class="label">input</div></div>
      <div class="card"><div class="num">${fmtTokens(u.totals.cacheRead)}</div><div class="label">cache read</div></div>
    </div>
    <h2>Daily activity</h2>
    <div class="panel">
      ${tokenBars(days.map(([d, t]) => [d.slice(5), t.input + t.output + t.cacheRead + t.cacheCreation]))}
    </div>
    <h2>Top sessions by output</h2>
    <div class="panel tight">
      <table>
        <thead><tr><th>Session</th><th class="num">Output</th><th class="num">Cache read</th><th class="num">Tools</th></tr></thead>
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
    </div>
    ${u.graphifyCandidates.length ? `
      <h2>Graphify candidates</h2>
      <p class="dim" style="margin-bottom:8px">Heavy repeated-context sessions — best targets for knowledge-graph token reduction.</p>
      <div class="panel tight">
        <table><tbody>
          ${u.graphifyCandidates.map((s) => `
            <tr><td>${esc((s.title || s.id).slice(0, 70))}</td><td class="num">${fmtTokens(s.tokens.cacheRead)} cache read</td></tr>`).join('')}
        </tbody></table>
      </div>` : ''}
  `
}

async function renderStatsSessions(body) {
  const projects = await api('/api/projects')
  const withSessions = projects.filter((p) => p.sessionCount > 0)
  if (!state.project || !withSessions.find((p) => p.id === state.project)) {
    state.project = withSessions[0]?.id || null
  }
  const sessions = state.project
    ? await api(`/api/sessions?project=${encodeURIComponent(state.project)}`)
    : []
  body.innerHTML = `
    <label class="field" style="max-width:420px">Project
      <select id="stats-project">
        ${withSessions.map((p) => `<option value="${esc(p.id)}" ${p.id === state.project ? 'selected' : ''}>${esc(projName(p.path))} (${p.sessionCount})</option>`).join('')}
      </select>
    </label>
    <div class="panel tight">
      <table>
        <thead><tr><th>Session</th><th class="num">Size</th><th class="num">Last activity</th><th></th></tr></thead>
        <tbody>
          ${sessions.map((s) => `
            <tr class="clickable" data-session="${esc(s.id)}">
              <td class="mono">${esc(s.id.slice(0, 8))}</td>
              <td class="num dim">${(s.bytes / 1024).toFixed(0)} KB</td>
              <td class="num dim">${fmtTime(s.lastModified)}</td>
              <td>${s.isActive ? '<span class="badge green">● active</span>' : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="session-detail"></div>
  `
  $('#stats-project').addEventListener('change', (e) => {
    state.project = e.target.value
    renderStatsSessions(body)
  })
  body.querySelectorAll('[data-session]').forEach((row) =>
    row.addEventListener('click', async () => {
      const el = $('#session-detail')
      el.innerHTML = '<div class="empty">Parsing transcript…</div>'
      const s = await api(`/api/session?project=${encodeURIComponent(state.project)}&id=${encodeURIComponent(row.dataset.session)}`)
      const totalTokens = s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheCreation
      el.innerHTML = `
        <div class="panel">
          <p style="font-weight:650">${esc(s.title || s.id)}</p>
          <p class="dim" style="font-size:12px;margin:4px 0 12px">${s.userMessages} user · ${s.assistantMessages} assistant · ${s.toolCalls} tool calls · ${s.subagents} subagents · ${fmtTokens(totalTokens)} tokens</p>
          ${tokenBars([['input', s.tokens.input], ['output', s.tokens.output], ['cache read', s.tokens.cacheRead], ['cache write', s.tokens.cacheCreation]])}
          <p style="margin-top:10px">${Object.keys(s.models).map((m) => `<span class="badge blue">${esc(shortModel(m))}</span>`).join(' ')}</p>
        </div>`
    })
  )
}

async function renderStatsAgents(body) {
  const agents = await api('/api/agents')
  body.innerHTML = agents.length ? `
    <div class="panel tight">
      <table>
        <thead><tr><th>Agent</th><th>Description</th><th>Model</th></tr></thead>
        <tbody>
          ${agents.map((a) => `
            <tr>
              <td style="white-space:nowrap"><strong>${esc(a.name)}</strong></td>
              <td class="dim">${esc((a.description || '').slice(0, 130))}</td>
              <td>${a.model ? `<span class="badge blue">${esc(a.model)}</span>` : '<span class="dim">inherit</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty">No agents installed.</div>'
}

async function renderStatsConnectors(body) {
  const { connectors, plugins } = await api('/api/connectors')
  body.innerHTML = `
    <p class="dim" style="margin-bottom:10px">MCP servers and extensions across your Claude configuration. Manage with <code>claude mcp</code> or <code>/mcp</code>.</p>
    ${connectors.length ? `
      <div class="panel tight">
        <table>
          <thead><tr><th>Connector</th><th>Transport</th><th>Scope</th><th>Source</th></tr></thead>
          <tbody>
            ${connectors.map((c) => `
              <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td><span class="badge">${esc(c.transport)}</span></td>
                <td class="dim">${esc(c.scope.startsWith('project:') ? projName(c.scope.slice(8)) : c.scope)}</td>
                <td class="dim mono">${esc((c.url || c.command || '').slice(0, 60))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<div class="empty">No MCP connectors configured.</div>'}
    ${plugins.length ? `
      <h2>Plugins</h2>
      <div class="panel tight">
        <table><tbody>
          ${plugins.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.enabled ? '<span class="badge green">enabled</span>' : '<span class="badge">disabled</span>'}</td></tr>`).join('')}
        </tbody></table>
      </div>` : ''}
  `
}

/* ---------- navigation + polling ---------- */

const pages = {
  home: renderHome,
  projects: renderProjects,
  routines: renderRoutines,
  runs: renderRuns,
  stats: renderStats,
  hq: renderHQ,
}

function go(page) {
  state.page = page
  document.querySelectorAll('#nav-main button').forEach((b) =>
    b.classList.toggle('active', b.dataset.page === page)
  )
  document.querySelectorAll('#nav-projects button').forEach((b) =>
    b.classList.toggle('active', page === 'hq' && b.dataset.hq === state.hqProject)
  )
  render()
}

function openHQ(path) {
  state.hqProject = path
  go('hq')
}

function render() {
  pages[state.page]().catch((err) => {
    main.innerHTML = `<div class="page"><div class="empty">Error: ${esc(err.message)}</div></div>`
  })
}

document.querySelectorAll('#nav-main button').forEach((b) =>
  b.addEventListener('click', () => go(b.dataset.page))
)

async function refreshSidebar() {
  try {
    const [projects, runs] = await Promise.all([api('/api/projects'), api('/api/runs')])
    const running = runs.filter((r) => r.status === 'running').length
    $('#running-indicator').classList.toggle('hidden', running === 0)
    $('#running-count').textContent = running

    const nav = $('#nav-projects')
    const top = projects.filter((p) => p.exists).slice(0, 7)
    nav.innerHTML = top.map((p) => `
      <button data-hq="${esc(p.path)}" class="${state.page === 'hq' && state.hqProject === p.path ? 'active' : ''}">
        <span class="icon">⛺</span><span class="nav-label">${esc(projName(p.path))}</span>${p.isActive ? '<span class="live-mark"></span>' : ''}
      </button>`).join('')
    nav.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => openHQ(b.dataset.hq))
    )
  } catch { /* server briefly unavailable */ }
}

render()
refreshSidebar()
setInterval(() => {
  refreshSidebar()
  if (!$('#modal-backdrop').classList.contains('hidden')) return
  if (state.page === 'home') render()
  if (state.page === 'hq' && !state.chatBusy) renderHQRail()
}, 6000)
