/* Basecamp — vanilla JS app, no build step. */

const state = {
  page: 'home',
  hqRepo: null,
  statsTab: 'activity',
  runId: null,
  chatBusy: false,
}

const $ = (sel) => document.querySelector(sel)
const main = $('#main')

/* ---------- icons (inline SVG, octicon-style) ---------- */

const icon = (name, size = 16) => `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${ICONS[name]}</svg>`
const ICONS = {
  home: '<path fill="currentColor" d="M6.906.664a1.75 1.75 0 0 1 2.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0 1 13.25 15h-3.5a.75.75 0 0 1-.75-.75V9H7v5.25a.75.75 0 0 1-.75.75h-3.5A1.75 1.75 0 0 1 1 13.25V6.23c0-.531.242-1.034.657-1.366l5.25-4.2Z"/>',
  repo: '<path fill="currentColor" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>',
  sync: '<path fill="currentColor" d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.001 7.001 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/>',
  play: '<path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>',
  graph: '<path fill="currentColor" d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/>',
  branch: '<path fill="currentColor" d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>',
  commit: '<path fill="currentColor" d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>',
  check: '<path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>',
  x: '<path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>',
  square: '<path fill="currentColor" d="M4 4h8v8H4z"/>',
  clock: '<path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>',
  chat: '<path fill="currentColor" d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z"/>',
  gear: '<path fill="currentColor" d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/>',
  stop: '<path fill="currentColor" d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25a.749.749 0 0 1-.53.22H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>',
  circle: '<path fill="currentColor" d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/>',
  circleo: '<path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>',
  checkbox: '<path fill="currentColor" d="M2.5 1.75v11.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H2.75a.25.25 0 0 0-.25.25ZM2.75 0h10.5C14.216 0 15 .784 15 1.75v11.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V1.75C1 .784 1.784 0 2.75 0Z"/>',
  checkboxOn: '<path fill="currentColor" d="M2.75 0h10.5C14.216 0 15 .784 15 1.75v11.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V1.75C1 .784 1.784 0 2.75 0Zm9.03 5.28a.75.75 0 0 0-1.06-1.06L6.75 8.19 5.28 6.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0Z"/>',
  arrowUp: '<path fill="currentColor" d="M3.47 7.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L9 4.81v8.44a.75.75 0 0 1-1.5 0V4.81L4.53 7.78a.75.75 0 0 1-1.06 0Z"/>',
  arrowDown: '<path fill="currentColor" d="M13.03 8.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.47 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L7.5 11.19V2.75a.75.75 0 0 1 1.5 0v8.44l2.97-2.97a.75.75 0 0 1 1.06 0Z"/>',
  terminal: '<path fill="currentColor" d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM7.25 8a.749.749 0 0 1-.22.53l-2.25 2.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L5.44 8 3.72 6.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.25 2.25c.141.14.22.331.22.53Zm1.5 1.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Z"/>',
}

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
  if (diff < 30 * 86400e3) return Math.floor(diff / 86400e3) + 'd ago'
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
const repoName = (p) => String(p || '').split('/').filter(Boolean).pop() || p
const shortModel = (m) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')

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

const statusChip = (status) =>
  ({
    running: `<span class="chip green"><span class="dot green pulse"></span>running</span>`,
    succeeded: `<span class="chip green">${icon('check', 12)}done</span>`,
    failed: `<span class="chip red">${icon('x', 12)}failed</span>`,
    stopped: `<span class="chip">stopped</span>`,
  })[status] || `<span class="chip">${esc(status)}</span>`

/** Animated count-up for stat numbers. */
function countUp(el, target, format = fmt.format.bind(fmt)) {
  const dur = 600
  const t0 = performance.now()
  const tick = (t) => {
    const p = Math.min((t - t0) / dur, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    el.textContent = format(Math.round(target * eased))
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function animateCards(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const value = Number(el.dataset.count)
    const format = el.dataset.tokens ? fmtTokens : fmt.format.bind(fmt)
    countUp(el, value, format)
  })
}

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

function repoOptions(repos, selected) {
  return repos
    .filter((r) => r.exists)
    .map((r) => `<option value="${esc(r.path)}" ${r.path === selected ? 'selected' : ''}>${esc(repoName(r.path))} — ${esc(r.path)}</option>`)
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

async function openTaskModal(repoPath = null, presetPrompt = '') {
  const repos = await api('/api/projects')
  openModal(`
    <h2>Run a background task</h2>
    <form id="task-form">
      <label class="field">Repository
        <select name="projectPath">${repoOptions(repos, repoPath)}</select>
      </label>
      <label class="field">What should Claude do?
        <textarea name="prompt" required placeholder="e.g. Review TODO.md and continue development on the next unchecked item. Run the tests, and commit your work when they pass.">${esc(presetPrompt)}</textarea>
      </label>
      ${modelPermissionFields()}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">Run now</button>
      </div>
    </form>`)
  wireModalForm('#task-form', async (fields) => {
    await api('/api/runs', { method: 'POST', body: { ...fields, model: fields.model || null } })
    go('runs')
  })
}

/** routine may be a saved routine (has .id → edit) or a template draft (no .id → create prefilled). */
async function openRoutineModal(routine = null, presetRepo = null) {
  const repos = await api('/api/projects')
  const s = routine?.schedule || {}
  openModal(`
    <h2>${routine?.id ? 'Edit routine' : 'New routine'}</h2>
    <form id="routine-form">
      <label class="field">Name
        <input name="name" value="${esc(routine?.name || '')}" placeholder="Nightly tests" required />
      </label>
      <label class="field">Repository
        <select name="projectPath">${repoOptions(repos, routine?.projectPath || presetRepo)}</select>
      </label>
      <label class="field">Prompt
        <textarea name="prompt" required placeholder="Run the test suite. If anything fails, fix it and commit.">${esc(routine?.prompt || '')}</textarea>
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
        <button type="submit" class="btn primary">${routine?.id ? 'Save' : 'Create routine'}</button>
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
    if (routine?.id) await api(`/api/routines/${routine.id}`, { method: 'PUT', body })
    else await api('/api/routines', { method: 'POST', body })
    render()
  })
}

/* ---------- routine templates ---------- */

const TEMPLATES = [
  {
    label: 'Nightly test fixer',
    description: 'Runs the suite every night; fixes and commits failures.',
    name: 'Nightly tests',
    prompt: 'Run the full test suite. If anything fails, diagnose and fix it, re-run until green, and commit the fixes with clear messages. If everything passes, say so briefly.',
    schedule: { type: 'daily', time: '21:00' },
  },
  {
    label: 'Morning briefing',
    description: 'A daily summary of commits, TODOs, and suggested next steps.',
    name: 'Morning briefing',
    prompt: 'Summarize what changed in this repository in the last 24 hours (git log). List open TODO/FIXME comments and any failing checks. End with the three most valuable next steps.',
    schedule: { type: 'daily', time: '08:30' },
    permissionMode: 'plan',
  },
  {
    label: 'Changelog keeper',
    description: 'Keeps CHANGELOG.md current with recent commits.',
    name: 'Changelog keeper',
    prompt: 'Review commits since the last CHANGELOG.md update and add concise entries for user-facing changes under an Unreleased heading. Create the file if missing. Commit the update.',
    schedule: { type: 'weekly', day: 5, time: '16:00' },
  },
  {
    label: 'TODO triager',
    description: 'Collects TODO/FIXME comments into a prioritized list.',
    name: 'TODO triage',
    prompt: 'Find all TODO, FIXME, and HACK comments in the codebase. Write them into TODO.md grouped by priority with file references, removing entries that no longer exist. Commit the update.',
    schedule: { type: 'weekly', day: 1, time: '09:00' },
  },
  {
    label: 'Dependency watcher',
    description: 'Checks for outdated or vulnerable dependencies.',
    name: 'Dependency check',
    prompt: 'Check for outdated and vulnerable dependencies using the appropriate package manager. Report what should be updated and why. Do not update anything without noting breaking changes.',
    schedule: { type: 'weekly', day: 3, time: '10:00' },
    permissionMode: 'plan',
  },
]

function openTemplatePicker() {
  openModal(`
    <h2>Routine templates</h2>
    ${TEMPLATES.map((t, i) => `
      <div class="row clickable" data-template="${i}" style="border:1px solid var(--border-muted);border-radius:6px;margin-bottom:8px">
        <div class="grow">
          <div class="title">${esc(t.label)}</div>
          <div class="sub">${esc(t.description)}</div>
        </div>
      </div>`).join('')}
    <div class="modal-actions"><button type="button" class="btn" id="tpl-close">Cancel</button></div>`)
  $('#tpl-close').addEventListener('click', closeModal)
  document.querySelectorAll('[data-template]').forEach((el) =>
    el.addEventListener('click', () => {
      closeModal()
      openRoutineModal({ ...TEMPLATES[Number(el.dataset.template)] })
    })
  )
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

/* ---------- charts ---------- */

/** GitHub-style contribution heatmap (grayscale). */
function heatmapSvg(counts, days) {
  const cell = 11
  const gap = 3
  const weeks = Math.ceil(days / 7)
  const today = new Date()
  const values = Object.values(counts)
  const max = Math.max(...values, 1)
  const level = (c) => (c === 0 ? 0 : c <= max * 0.25 ? 1 : c <= max * 0.5 ? 2 : c <= max * 0.75 ? 3 : 4)

  let cells = ''
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const daysAgo = (weeks - 1 - w) * 7 + (6 - d)
      const date = new Date(today.getTime() - daysAgo * 86400e3)
      if (date > today) continue
      const key = date.toISOString().slice(0, 10)
      const count = counts[key] || 0
      cells += `<rect class="heatmap-cell" x="${w * (cell + gap)}" y="${d * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5"
        fill="var(--heat-${level(count)})" style="animation-delay:${(w * 8)}ms"><title>${key}: ${count} session${count === 1 ? '' : 's'}</title></rect>`
    }
  }
  const width = weeks * (cell + gap)
  const height = 7 * (cell + gap)
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${cells}</svg>`
}

/** Animated area chart from [label, value] pairs. */
function areaChartSvg(points, { width = 640, height = 140 } = {}) {
  if (points.length < 2) return '<div class="empty">Not enough data yet.</div>'
  const pad = 4
  const max = Math.max(...points.map(([, v]) => v), 1)
  const stepX = (width - pad * 2) / (points.length - 1)
  const y = (v) => height - pad - (v / max) * (height - pad * 2)
  const coords = points.map(([, v], i) => [pad + i * stepX, y(v)])
  const line = coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height - pad} L${pad},${height - pad} Z`
  return `
    <svg width="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="display:block">
      <path class="area-fill" d="${area}" fill="var(--bg-subtle)" />
      <path class="area-path" id="area-line" d="${line}" />
    </svg>
    <div style="display:flex;justify-content:space-between;color:var(--faint);font-size:11px;padding:4px 2px 0">
      <span>${esc(points[0][0])}</span><span>${esc(points[points.length - 1][0])}</span>
    </div>`
}

function animateAreaLine(root) {
  const path = root.querySelector('#area-line')
  if (!path) return
  const len = path.getTotalLength()
  path.style.strokeDasharray = len
  path.style.strokeDashoffset = len
  path.getBoundingClientRect() // force layout
  path.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)'
  path.style.strokeDashoffset = '0'
}

/** Animated donut showing a percentage. */
function donutSvg(pct, label) {
  const r = 34
  const c = 2 * Math.PI * r
  return `
    <div style="display:flex;align-items:center;gap:14px">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle class="donut-track" cx="42" cy="42" r="${r}" stroke-width="8"/>
        <circle class="donut-val" cx="42" cy="42" r="${r}" stroke-width="8" transform="rotate(-90 42 42)"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target="${(c * (1 - pct / 100)).toFixed(1)}"/>
        <text x="42" y="47" text-anchor="middle" font-size="17" font-weight="600" fill="var(--text)">${Math.round(pct)}%</text>
      </svg>
      <div class="muted" style="font-size:12.5px">${esc(label)}</div>
    </div>`
}

function animateDonuts(root) {
  requestAnimationFrame(() =>
    root.querySelectorAll('.donut-val').forEach((el) => {
      el.style.strokeDashoffset = el.dataset.target
    })
  )
}

/* ---------- git chips ---------- */

function gitChips(git) {
  if (!git) return ''
  const parts = []
  if (git.branch) parts.push(`<span class="chip mono">${icon('branch', 12)}${esc(git.branch)}</span>`)
  if (git.dirtyFiles) parts.push(`<span class="chip">${git.dirtyFiles} uncommitted</span>`)
  if (git.ahead) parts.push(`<span class="chip">${icon('arrowUp', 11)}${git.ahead}</span>`)
  if (git.behind) parts.push(`<span class="chip">${icon('arrowDown', 11)}${git.behind}</span>`)
  return parts.join(' ')
}

/* ---------- Home ---------- */

async function renderHome() {
  const [overview, updates, runs, routines, digest] = await Promise.all([
    api('/api/overview'),
    api('/api/updates'),
    api('/api/runs'),
    api('/api/routines'),
    api('/api/digest'),
  ])
  const running = runs.filter((r) => r.status === 'running')
  const upcoming = routines
    .filter((r) => r.enabled && r.nextRun)
    .sort((a, b) => a.nextRun - b.nextRun)
    .slice(0, 3)
  const hour = new Date().getHours()
  const showDigest = digest.items.length > 0 && Date.now() - digest.since > 30 * 60e3 && digest.since > 0

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1>
          <p class="subtitle">${overview.activeSessions.length} active session${overview.activeSessions.length === 1 ? '' : 's'} · ${running.length} background run${running.length === 1 ? '' : 's'} · ${routines.filter((r) => r.enabled).length} routine${routines.filter((r) => r.enabled).length === 1 ? '' : 's'} armed</p>
        </div>
        <button class="btn primary" id="new-task">${icon('play', 14)}Run a task</button>
      </div>

      ${showDigest ? `
        <div class="digest">
          <div class="d-head">${icon('clock', 15)} While you were away · ${digest.items.length} update${digest.items.length === 1 ? '' : 's'}
            <button class="btn small" id="digest-ack" style="margin-left:auto">Dismiss</button>
          </div>
          <ul>
            ${digest.items.slice(0, 8).map((u) => `<li><strong>${esc(u.title)}</strong>${u.commits?.length ? ` — ${u.commits.length} commit${u.commits.length === 1 ? '' : 's'}` : ''}${u.body && !u.commits?.length ? ` — ${esc(u.body.slice(0, 90))}` : ''}</li>`).join('')}
            ${digest.items.length > 8 ? `<li class="muted">…and ${digest.items.length - 8} more below</li>` : ''}
          </ul>
        </div>` : ''}

      ${running.length ? `
        <div class="box">
          <div class="box-head">${icon('play', 14)} Running now <span class="count">${running.length}</span></div>
          ${running.map((r) => `
            <div class="row clickable" data-run="${r.id}">
              <span class="dot green pulse"></span>
              <div class="grow">
                <div class="title">${esc(r.routineName || repoName(r.projectPath))}</div>
                <div class="sub mono">${esc(r.prompt.slice(0, 100))}</div>
              </div>
              <span class="muted">${fmtDuration(r.startedAt)}</span>
            </div>`).join('')}
        </div>` : ''}

      ${upcoming.length ? `
        <div class="box">
          <div class="box-head">${icon('clock', 14)} Up next</div>
          ${upcoming.map((r) => `
            <div class="row">
              <div class="grow">
                <div class="title">${esc(r.name)} <span class="muted" style="font-weight:400">· ${esc(repoName(r.projectPath))}</span></div>
              </div>
              <span class="chip">${esc(fmtUntil(r.nextRun))}</span>
            </div>`).join('')}
        </div>` : ''}

      <div class="box">
        <div class="box-head">${icon('graph', 14)} Updates ${updates.length ? `<span class="count">${updates.length}</span>` : ''}</div>
        ${updates.length ? updates.slice(0, 25).map((u) => `
          <div class="feed-item">
            <div class="feed-icon ${u.kind === 'run-succeeded' ? 'ok' : u.kind === 'run-failed' ? 'fail' : ''}">${icon(u.kind === 'run-succeeded' ? 'check' : u.kind === 'run-failed' ? 'x' : 'commit', 14)}</div>
            <div class="feed-body">
              <div class="feed-title">${esc(u.title)}</div>
              ${u.body ? `<div class="feed-text">${esc(u.body)}</div>` : ''}
              <div class="feed-meta">
                <span>${fmtTime(u.createdAt)}</span>
                ${u.costUsd ? `<span>$${u.costUsd.toFixed(2)}</span>` : ''}
                ${(u.commits || []).map((c) => `<span class="chip mono">${icon('commit', 11)}${esc(c.sha)}</span>`).join('')}
                ${u.runId ? `<a href="#" data-run-link="${u.runId}">view run</a>` : ''}
              </div>
            </div>
          </div>`).join('') : `
          <div class="empty">Nothing yet. Updates appear when routines fire and background runs finish.</div>`}
      </div>
    </div>`

  $('#new-task')?.addEventListener('click', () => openTaskModal())
  $('#digest-ack')?.addEventListener('click', async () => {
    await api('/api/digest/ack', { method: 'POST' })
    renderHome()
  })
  main.querySelectorAll('[data-run]').forEach((el) =>
    el.addEventListener('click', () => { state.runId = el.dataset.run; go('runs') })
  )
  main.querySelectorAll('[data-run-link]').forEach((el) =>
    el.addEventListener('click', (e) => { e.preventDefault(); state.runId = el.dataset.runLink; go('runs') })
  )
}

/* ---------- Repos ---------- */

async function renderRepos() {
  main.innerHTML = '<div class="page"><h1>Repositories</h1><p class="subtitle">Loading git status…</p></div>'
  const repos = (await api('/api/projects?git=1')).filter((r) => r.exists)
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Repositories</h1><p class="subtitle">Open a repository to talk to its manager.</p></div>
      </div>
      <div class="box">
        ${repos.map((r) => `
          <div class="row clickable" data-hq="${esc(r.path)}">
            <span style="color:var(--muted)">${icon('repo', 16)}</span>
            <div class="grow">
              <div class="title">
                ${esc(repoName(r.path))}
                ${r.isActive ? '<span class="chip green"><span class="dot green pulse"></span>active</span>' : ''}
                ${gitChips(r.git)}
              </div>
              <div class="sub">
                ${r.git?.commit ? `${esc(r.git.commit.subject.slice(0, 80))} · ${fmtTime(r.git.commit.time)}` : `<span class="mono">${esc(r.path)}</span>`}
              </div>
            </div>
            <span class="muted" style="font-size:12px">${fmtTime(r.lastModified)}</span>
          </div>`).join('')}
        ${repos.length === 0 ? '<div class="empty">No repositories found. Run Claude Code in a project first.</div>' : ''}
      </div>
    </div>`
  main.querySelectorAll('[data-hq]').forEach((el) =>
    el.addEventListener('click', () => openHQ(el.dataset.hq))
  )
}

/* ---------- HQ (manager chat) ---------- */

async function renderHQ() {
  const path = state.hqRepo
  main.innerHTML = `
    <div class="hq">
      <div class="hq-head">
        <span style="color:var(--muted)">${icon('repo', 16)}</span>
        <h1>${esc(repoName(path))}</h1>
        <span class="git-line" id="hq-git"></span>
        <span style="flex:1"></span>
        <button class="btn small" id="hq-run-task">${icon('play', 13)}Background task</button>
      </div>
      <div class="hq-body">
        <div class="chat-col">
          <div class="chat-scroll" id="chat-scroll">
            <div class="chat-thread" id="chat-thread"><div class="empty">Loading…</div></div>
          </div>
          <div class="composer">
            <div class="composer-inner">
              <textarea id="chat-input" rows="1" placeholder="Message the manager…"></textarea>
              <button class="btn primary" id="chat-send">Send</button>
            </div>
            <div class="hint">Full Claude Code tools in this repo. It can schedule routines, track goals, launch runs, and configure hooks. It keeps durable notes in BASECAMP.md.</div>
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

  api('/api/projects?git=1').then((repos) => {
    const repo = repos.find((r) => r.path === path)
    const el = $('#hq-git')
    if (el && repo?.git) el.innerHTML = gitChips(repo.git)
  })

  await Promise.all([loadChatHistory(), renderHQRail()])
  input.focus()
}

function chatBubble(role, html) {
  return `<div class="msg ${role}">
    <div class="who">${role === 'user' ? 'you' : 'manager'}</div>
    <div class="bubble">${html}</div>
  </div>`
}

async function loadChatHistory() {
  const thread = $('#chat-thread')
  try {
    const { messages, busy } = await api(`/api/chat/history?project=${encodeURIComponent(state.hqRepo)}`)
    state.chatBusy = busy
    if (!messages.length) {
      thread.innerHTML = `
        <div class="empty">
          This repository's manager. It remembers everything across sessions.<br/><br/>
          <span class="muted">"Set up a routine to run the tests every morning and fix failures."<br/>
          "Our goal is to ship v1 by end of month — track it."<br/>
          "What changed in this repo this week?"</span>
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
      body: JSON.stringify({ projectPath: state.hqRepo, message }),
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
        try {
          handleChatEvent(JSON.parse(line))
        } catch { /* partial line */ }
      }
    }
  } catch (err) {
    handleChatEvent({ type: 'text', text: `Error: ${err.message}` })
  }
  $('#thinking')?.remove()
  state.chatBusy = false
  $('#chat-send').disabled = false
  renderHQRail()
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
      `<div class="tool-chip"><span class="tname">${esc(event.name)}</span>${event.detail ? `<span>${esc(event.detail)}</span>` : ''}</div>`
    )
  }
  if (event.type !== 'done') {
    thread.insertAdjacentHTML('beforeend', '<div class="thinking" id="thinking"><span></span><span></span><span></span></div>')
  }
  if (event.type === 'done' && event.error && !thread.textContent.includes(event.error)) {
    thread.insertAdjacentHTML('beforeend', chatBubble('assistant', md(`Error: ${event.error}`)))
  }
  scrollChat()
}

async function renderHQRail() {
  const rail = $('#hq-rail')
  if (!rail) return
  const path = state.hqRepo
  const [sessions, goals, routines, runs] = await Promise.all([
    api(`/api/repo/sessions?path=${encodeURIComponent(path)}`),
    api(`/api/goals?project=${encodeURIComponent(path)}`),
    api('/api/routines'),
    api('/api/runs'),
  ])
  const repoRoutines = routines.filter((r) => r.projectPath === path)
  const repoRuns = runs.filter((r) => r.projectPath === path).slice(0, 5)
  const open = goals.filter((g) => g.status === 'open')
  const done = goals.filter((g) => g.status === 'done').slice(0, 3)
  const active = sessions.filter((s) => s.isActive)
  const recent = sessions.filter((s) => !s.isActive).slice(0, 3)

  rail.innerHTML = `
    <h2>Sessions</h2>
    ${active.map((s) => `
      <div class="rail-item">
        <div class="t"><span class="mono">${esc(s.id.slice(0, 8))}</span><span class="chip green"><span class="dot green pulse"></span>active</span></div>
        <div class="s">${(s.bytes / 1024).toFixed(0)} KB · ${fmtTime(s.lastModified)}</div>
      </div>`).join('')}
    ${recent.map((s) => `
      <div class="rail-item">
        <div class="t"><span class="mono muted">${esc(s.id.slice(0, 8))}</span></div>
        <div class="s">${fmtTime(s.lastModified)}</div>
      </div>`).join('')}
    ${sessions.length === 0 ? '<div class="faint" style="font-size:12px">No sessions in this repo yet.</div>' : ''}

    <h2>Goals</h2>
    ${open.concat(done).map((g) => `
      <div class="rail-item ${g.status === 'done' ? 'goal-done' : ''}">
        <div class="t">
          <span class="goal-toggle" data-goal="${g.id}" data-status="${g.status}">
            ${icon(g.status === 'done' ? 'checkboxOn' : 'checkbox', 14)}
            <span>${esc(g.title)}</span>
          </span>
        </div>
        ${g.notes ? `<div class="s">${esc(g.notes)}</div>` : ''}
      </div>`).join('') || '<div class="faint" style="font-size:12px">None yet — tell the manager what you are driving toward.</div>'}

    <h2>Routines</h2>
    ${repoRoutines.map((r) => `
      <div class="rail-item">
        <div class="t"><span>${esc(r.name)}</span>${r.enabled ? `<span class="chip">${esc(fmtUntil(r.nextRun))}</span>` : '<span class="chip">paused</span>'}</div>
        <div class="s">${esc(r.scheduleLabel)}</div>
      </div>`).join('') || '<div class="faint" style="font-size:12px">None yet — ask the manager to schedule one.</div>'}

    <h2>Recent runs</h2>
    ${repoRuns.map((r) => `
      <div class="rail-item">
        <div class="t"><span>${esc((r.routineName || r.prompt).slice(0, 30))}</span>${statusChip(r.status)}</div>
        <div class="s">${fmtTime(r.startedAt)}${(r.commits || []).length ? ` · ${r.commits.length} commit${r.commits.length === 1 ? '' : 's'}` : ''}${r.costUsd ? ` · $${r.costUsd.toFixed(2)}` : ''}</div>
      </div>`).join('') || '<div class="faint" style="font-size:12px">No background runs yet.</div>'}

    <h2>GitHub</h2>
    <div id="hq-github"><div class="faint" style="font-size:12px">Checking…</div></div>
  `
  renderHQGithub()
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

async function renderHQGithub() {
  const el = $('#hq-github')
  if (!el) return
  try {
    const gh = await api(`/api/repo/github?path=${encodeURIComponent(state.hqRepo)}`)
    const current = $('#hq-github')
    if (!current) return
    if (!gh.available) {
      current.innerHTML = `<div class="faint" style="font-size:12px">${esc(gh.reason)}</div>`
      return
    }
    current.innerHTML = `
      ${gh.issues.map((i) => `
        <div class="rail-item">
          <div class="t"><span>#${i.number} ${esc(i.title.slice(0, 34))}</span>
            <button class="btn small" data-issue="${i.number}" title="Launch a background run on this issue">Work on it</button>
          </div>
          <div class="s">issue · ${fmtTime(Date.parse(i.updatedAt))}</div>
        </div>`).join('')}
      ${gh.prs.map((p) => `
        <div class="rail-item">
          <div class="t"><span>#${p.number} ${esc(p.title.slice(0, 38))}</span>${p.isDraft ? '<span class="chip">draft</span>' : '<span class="chip green">open</span>'}</div>
          <div class="s">pull request · ${fmtTime(Date.parse(p.updatedAt))}</div>
        </div>`).join('')}
      ${gh.issues.length === 0 && gh.prs.length === 0 ? '<div class="faint" style="font-size:12px">No open issues or pull requests.</div>' : ''}
    `
    current.querySelectorAll('[data-issue]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        btn.disabled = true
        btn.textContent = 'Launched'
        await api('/api/repo/issue-run', {
          method: 'POST',
          body: { path: state.hqRepo, issue: Number(btn.dataset.issue) },
        })
      })
    )
  } catch (err) {
    if ($('#hq-github')) $('#hq-github').innerHTML = `<div class="faint" style="font-size:12px">${esc(err.message)}</div>`
  }
}

/* ---------- Routines ---------- */

async function renderRoutines() {
  const routines = await api('/api/routines')
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Routines</h1><p class="subtitle">Scheduled prompts that run Claude Code automatically. Managers can create these too. Each routine also has a webhook URL for triggering from CI.</p></div>
        <span style="display:flex;gap:8px">
          <button class="btn" id="templates">Templates</button>
          <button class="btn primary" id="new-routine">New routine</button>
        </span>
      </div>
      ${routines.length ? `
        <div class="box">
          ${routines.map((r) => `
            <div class="row">
              <span style="color:var(--muted)">${icon('sync', 15)}</span>
              <div class="grow">
                <div class="title">${esc(r.name)} <span class="muted" style="font-weight:400">· ${esc(repoName(r.projectPath))}</span>
                  <span class="chip">${esc(r.scheduleLabel)}</span>
                  ${r.enabled ? `<span class="chip solid">${esc(fmtUntil(r.nextRun))}</span>` : '<span class="chip">paused</span>'}
                </div>
                <div class="sub mono">${esc(r.prompt.slice(0, 110))}${r.prompt.length > 110 ? '…' : ''}</div>
              </div>
              <span style="white-space:nowrap;display:flex;gap:6px">
                <button class="btn small" data-fire="${r.id}" title="Run now">${icon('play', 12)}</button>
                <button class="btn small" data-hook="${esc(r.webhookToken || '')}" title="Copy webhook URL">Webhook</button>
                <button class="btn small" data-toggle="${r.id}">${r.enabled ? 'Pause' : 'Resume'}</button>
                <button class="btn small" data-edit="${r.id}">Edit</button>
                <button class="btn small danger" data-del="${r.id}">${icon('x', 12)}</button>
              </span>
            </div>`).join('')}
        </div>` : `
        <div class="box"><div class="empty">
          No routines yet. Create one here, or tell a manager:<br/><br/>
          <span class="muted">"Every morning at 9, run the tests and fix anything that fails."</span>
        </div></div>`}
    </div>`
  $('#new-routine')?.addEventListener('click', () => openRoutineModal())
  $('#templates')?.addEventListener('click', openTemplatePicker)
  main.querySelectorAll('[data-hook]').forEach((el) =>
    el.addEventListener('click', async () => {
      const hookUrl = `${location.origin}/api/hooks/${el.dataset.hook}`
      await navigator.clipboard.writeText(`curl -X POST ${hookUrl}`)
      el.textContent = 'Copied'
      setTimeout(() => { el.textContent = 'Webhook' }, 1500)
    })
  )
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
        <button class="btn primary" id="new-task">${icon('play', 14)}Run a task</button>
      </div>
      ${runs.length ? `
        <div class="box">
          ${runs.slice(0, 40).map((r) => `
            <div class="row clickable" data-run="${r.id}">
              <div class="grow">
                <div class="title">${esc(r.routineName || repoName(r.projectPath))}
                  ${statusChip(r.status)}
                  ${(r.commits || []).slice(0, 3).map((c) => `<span class="chip mono">${icon('commit', 11)}${esc(c.sha)}</span>`).join('')}
                </div>
                <div class="sub mono">${esc(r.prompt.slice(0, 110))}</div>
              </div>
              <span class="muted" style="font-size:12px;text-align:right;white-space:nowrap">
                ${fmtTime(r.startedAt)}<br/>${fmtDuration(r.startedAt, r.endedAt)}${r.costUsd ? ` · $${r.costUsd.toFixed(2)}` : ''}
              </span>
              ${r.status === 'running' ? `<button class="btn small danger" data-stop="${r.id}">Stop</button>` : ''}
            </div>`).join('')}
        </div>` : '<div class="box"><div class="empty">No runs yet.</div></div>'}
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
      <div class="box box-pad">
        <p><strong>${esc(run.routineName || repoName(run.projectPath))}</strong> ${statusChip(run.status)}</p>
        <p class="muted mono" style="margin:6px 0">${esc(run.projectPath)}</p>
        <p class="mono" style="margin:6px 0;color:var(--text-secondary)">${esc(run.prompt)}</p>
        ${(run.commits || []).length ? `<p style="margin:8px 0">${run.commits.map((c) => `<span class="chip mono">${icon('commit', 11)}${esc(c.sha)} ${esc(c.subject.slice(0, 50))}</span>`).join(' ')}</p>` : ''}
        ${run.resultText ? `<div class="box box-pad" style="margin:10px 0;background:var(--bg-subtle)"><div style="white-space:pre-wrap;font-size:13px">${esc(run.resultText)}</div></div>` : ''}
        <p class="faint" style="font-size:12px;margin-top:8px">
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
      <p class="subtitle">Activity and performance across everything Claude Code does on this machine.</p>
      <div id="stats-cards"></div>
      <div class="stats-tabs">
        ${['activity', 'usage', 'agents', 'connectors'].map((t) =>
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
        <div class="card"><div class="num" data-count="${o.sessionCount}">0</div><div class="label">sessions</div></div>
        <div class="card"><div class="num" data-count="${o.projectCount}">0</div><div class="label">repositories</div></div>
        <div class="card"><div class="num" style="color:${o.activeSessions.length ? 'var(--green)' : 'inherit'}">${o.activeSessions.length}</div><div class="label">active now</div></div>
        <div class="card"><div class="num" data-count="${o.agentCount}">0</div><div class="label">agents</div></div>
        <div class="card"><div class="num" data-count="${o.connectorCount}">0</div><div class="label">connectors</div></div>
      </div>`
    animateCards(el)
  })
  const body = $('#stats-body')
  const renderers = {
    activity: renderStatsActivity,
    usage: renderStatsUsage,
    agents: renderStatsAgents,
    connectors: renderStatsConnectors,
  }
  renderers[state.statsTab](body).catch((err) => {
    body.innerHTML = `<div class="empty">${esc(err.message)}</div>`
  })
}

async function renderStatsActivity(body) {
  body.innerHTML = '<div class="empty">Computing…</div>'
  const [heatmap, usage, runs] = await Promise.all([
    api('/api/heatmap'),
    api('/api/usage'),
    api('/api/runs'),
  ])

  const finished = runs.filter((r) => r.status === 'succeeded' || r.status === 'failed')
  const succeeded = finished.filter((r) => r.status === 'succeeded')
  const successRate = finished.length ? (succeeded.length / finished.length) * 100 : 100
  const avgDuration = finished.length
    ? finished.reduce((sum, r) => sum + ((r.endedAt || 0) - r.startedAt), 0) / finished.length
    : 0
  const totalCost = runs.reduce((sum, r) => sum + (r.costUsd || 0), 0)
  const totalCommits = runs.reduce((sum, r) => sum + (r.commits?.length || 0), 0)

  const days = Object.entries(usage.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-30)
  const points = days.map(([d, t]) => [d.slice(5), t.input + t.output + t.cacheRead + t.cacheCreation])

  body.innerHTML = `
    <div class="box">
      <div class="box-head">${icon('graph', 14)} Session activity · ${heatmap.days} days</div>
      <div class="chart-wrap">${heatmapSvg(heatmap.counts, heatmap.days)}</div>
    </div>

    <div class="box">
      <div class="box-head">${icon('graph', 14)} Tokens per day · 30 days</div>
      <div class="chart-wrap" id="area-wrap">${areaChartSvg(points)}</div>
    </div>

    <h2>Background run performance</h2>
    <div class="cards">
      <div class="card">${donutSvg(successRate, 'run success rate')}</div>
      <div class="card"><div class="num">${avgDuration ? fmtDuration(Date.now() - avgDuration, Date.now()) : '—'}</div><div class="label">avg run duration</div></div>
      <div class="card"><div class="num" data-count="${finished.length}">0</div><div class="label">runs completed</div></div>
      <div class="card"><div class="num" data-count="${totalCommits}">0</div><div class="label">commits by runs</div></div>
      <div class="card"><div class="num">$${totalCost.toFixed(2)}</div><div class="label">total run cost</div></div>
    </div>
  `
  animateCards(body)
  animateDonuts(body)
  animateAreaLine(body)
}

async function renderStatsUsage(body) {
  body.innerHTML = '<div class="empty">Crunching transcripts…</div>'
  const u = await api('/api/usage')
  const total = u.totals.input + u.totals.output + u.totals.cacheRead + u.totals.cacheCreation
  body.innerHTML = `
    <div class="cards">
      <div class="card"><div class="num" data-count="${total}" data-tokens="1">0</div><div class="label">total tokens · ${u.windowDays}d</div></div>
      <div class="card"><div class="num" data-count="${u.totals.output}" data-tokens="1">0</div><div class="label">output</div></div>
      <div class="card"><div class="num" data-count="${u.totals.input}" data-tokens="1">0</div><div class="label">input</div></div>
      <div class="card"><div class="num" data-count="${u.totals.cacheRead}" data-tokens="1">0</div><div class="label">cache read</div></div>
    </div>
    <h2>Top sessions by output</h2>
    <div class="box">
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
      <p class="muted" style="margin-bottom:8px;font-size:13px">Heavy repeated-context sessions — best targets for knowledge-graph token reduction.</p>
      <div class="box">
        <table><tbody>
          ${u.graphifyCandidates.map((s) => `
            <tr><td>${esc((s.title || s.id).slice(0, 70))}</td><td class="num">${fmtTokens(s.tokens.cacheRead)} cache read</td></tr>`).join('')}
        </tbody></table>
      </div>` : ''}
  `
  animateCards(body)
}

async function renderStatsAgents(body) {
  const agents = await api('/api/agents')
  body.innerHTML = agents.length ? `
    <div class="box">
      <table>
        <thead><tr><th>Agent</th><th>Description</th><th>Model</th></tr></thead>
        <tbody>
          ${agents.map((a) => `
            <tr>
              <td style="white-space:nowrap"><strong>${esc(a.name)}</strong></td>
              <td class="muted">${esc((a.description || '').slice(0, 130))}</td>
              <td>${a.model ? `<span class="chip mono">${esc(a.model)}</span>` : '<span class="faint">inherit</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty">No agents installed.</div>'
}

async function renderStatsConnectors(body) {
  const { connectors, plugins } = await api('/api/connectors')
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <p class="muted" style="font-size:13px">MCP servers and extensions across your Claude configuration.</p>
      <button class="btn small" id="add-connector">Add connector</button>
    </div>
    ${connectors.length ? `
      <div class="box">
        <table>
          <thead><tr><th>Connector</th><th>Transport</th><th>Scope</th><th>Source</th><th></th></tr></thead>
          <tbody>
            ${connectors.map((c) => `
              <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td><span class="chip">${esc(c.transport)}</span></td>
                <td class="muted">${esc(c.scope.startsWith('project:') ? repoName(c.scope.slice(8)) : c.scope)}</td>
                <td class="muted mono">${esc((c.url || c.command || '').slice(0, 60))}</td>
                <td class="num">${c.scope === 'user' ? `<button class="btn small danger" data-rm-connector="${esc(c.name)}">Remove</button>` : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<div class="empty">No MCP connectors configured.</div>'}
    ${plugins.length ? `
      <h2>Plugins</h2>
      <div class="box">
        <table><tbody>
          ${plugins.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.enabled ? '<span class="chip green">enabled</span>' : '<span class="chip">disabled</span>'}</td></tr>`).join('')}
        </tbody></table>
      </div>` : ''}
  `
  $('#add-connector')?.addEventListener('click', openConnectorModal)
  body.querySelectorAll('[data-rm-connector]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm(`Remove connector "${el.dataset.rmConnector}" from ~/.claude.json? A backup is kept at .claude.json.basecamp-backup.`)) return
      await api(`/api/connectors/${encodeURIComponent(el.dataset.rmConnector)}`, { method: 'DELETE' })
      renderStats()
    })
  )
}

function openConnectorModal() {
  openModal(`
    <h2>Add MCP connector</h2>
    <p class="muted" style="font-size:12.5px;margin-bottom:14px">This writes to <span class="mono">~/.claude.json</span> (user scope) — the only place Basecamp modifies Claude configuration. A one-time backup is created first.</p>
    <form id="connector-form">
      <label class="field">Name
        <input name="name" placeholder="linear" pattern="[\\w-]+" required />
      </label>
      <label class="field">Transport
        <select name="transport" id="connector-transport">
          <option value="http">HTTP (remote server)</option>
          <option value="sse">SSE (remote server)</option>
          <option value="stdio">stdio (local command)</option>
        </select>
      </label>
      <label class="field" id="connector-url-field">URL
        <input name="url" placeholder="https://mcp.example.com/mcp" />
      </label>
      <label class="field hidden" id="connector-cmd-field">Command
        <input name="command" placeholder="npx some-mcp-server" />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">Add connector</button>
      </div>
    </form>`)
  $('#connector-transport').addEventListener('change', (e) => {
    const isStdio = e.target.value === 'stdio'
    $('#connector-url-field').classList.toggle('hidden', isStdio)
    $('#connector-cmd-field').classList.toggle('hidden', !isStdio)
  })
  wireModalForm('#connector-form', async (fields) => {
    const [command, ...args] = (fields.command || '').split(/\s+/).filter(Boolean)
    await api('/api/connectors', {
      method: 'POST',
      body: {
        name: fields.name,
        transport: fields.transport,
        url: fields.url || undefined,
        command: command || undefined,
        args: args.length ? args : undefined,
      },
    })
    renderStats()
  })
}

/* ---------- Settings ---------- */

async function renderSettings() {
  const s = await api('/api/settings')
  main.innerHTML = `
    <div class="page">
      <h1>Settings</h1>
      <p class="subtitle">Notification connectors — Basecamp reaches you when runs finish or fail, wherever you are.</p>
      <div class="box box-pad" style="max-width:560px">
        <form id="settings-form">
          <label class="field">Slack webhook URL
            <input name="slackWebhook" value="${esc(s.slackWebhook)}" placeholder="https://hooks.slack.com/services/…" />
          </label>
          <label class="field">Discord webhook URL
            <input name="discordWebhook" value="${esc(s.discordWebhook)}" placeholder="https://discord.com/api/webhooks/…" />
          </label>
          <div class="field-row">
            <label class="field">Telegram bot token
              <input name="telegramBotToken" value="${esc(s.telegramBotToken)}" placeholder="123456:ABC…" />
            </label>
            <label class="field">Telegram chat ID
              <input name="telegramChatId" value="${esc(s.telegramChatId)}" placeholder="-100123456" />
            </label>
          </div>
          <label class="field" style="display:flex;align-items:center;gap:8px;font-weight:500">
            <input type="checkbox" name="macosNotifications" style="width:auto;margin:0" ${s.macosNotifications ? 'checked' : ''} />
            macOS notifications
          </label>
          <label class="field" style="display:flex;align-items:center;gap:8px;font-weight:500">
            <input type="checkbox" name="notifyOnSuccess" style="width:auto;margin:0" ${s.notifyOnSuccess ? 'checked' : ''} />
            Also notify on successful runs (failures always notify)
          </label>
          <div class="modal-actions" style="justify-content:flex-start">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="test-notify">Send test notification</button>
            <span id="settings-status" class="muted" style="align-self:center;font-size:12.5px"></span>
          </div>
        </form>
      </div>

      <h2>Trigger routines from anywhere</h2>
      <div class="box box-pad" style="max-width:560px">
        <p class="muted" style="font-size:13px;margin-bottom:8px">Every routine has a secret webhook URL (copy it from the Routines page). POST to it from CI, a GitHub Action, or anything else:</p>
        <div class="log-view" style="max-height:none">curl -X POST http://localhost:4747/api/hooks/&lt;token&gt;</div>
      </div>

      <h2>Use Basecamp from any Claude session</h2>
      <div class="box box-pad" style="max-width:560px">
        <p class="muted" style="font-size:13px;margin-bottom:8px">Register Basecamp as an MCP server and any Claude Code session can check the digest, schedule routines, and launch runs:</p>
        <div class="log-view" style="max-height:none">claude mcp add basecamp -- npx claude-basecamp mcp</div>
      </div>
    </div>`

  const form = $('#settings-form')
  const status = $('#settings-status')
  const collect = () => {
    const data = Object.fromEntries(new FormData(form).entries())
    return {
      slackWebhook: data.slackWebhook || '',
      discordWebhook: data.discordWebhook || '',
      telegramBotToken: data.telegramBotToken || '',
      telegramChatId: data.telegramChatId || '',
      macosNotifications: form.macosNotifications.checked,
      notifyOnSuccess: form.notifyOnSuccess.checked,
    }
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    await api('/api/settings', { method: 'PUT', body: collect() })
    status.textContent = 'Saved'
    setTimeout(() => { status.textContent = '' }, 2000)
  })
  $('#test-notify').addEventListener('click', async () => {
    await api('/api/settings', { method: 'PUT', body: collect() })
    status.textContent = 'Sending…'
    const { results } = await api('/api/notify/test', { method: 'POST' })
    status.textContent = results.length
      ? results.map((r) => `${r.channel}: ${r.ok ? 'ok' : r.error || 'failed'}`).join(' · ')
      : 'No channels configured'
  })
}

/* ---------- command palette ---------- */

const palette = {
  open: false,
  items: [],
  selected: 0,
}

async function openPalette() {
  palette.open = true
  $('#palette-backdrop').classList.remove('hidden')
  const input = $('#palette-input')
  input.value = ''
  input.focus()
  const repos = await api('/api/projects').catch(() => [])
  palette.items = [
    ...repos.filter((r) => r.exists).map((r) => ({
      label: repoName(r.path),
      hint: 'open manager',
      iconName: 'repo',
      keywords: r.path.toLowerCase(),
      action: () => openHQ(r.path),
    })),
    { label: 'Run a task', hint: 'command', iconName: 'play', keywords: 'run task new', action: () => openTaskModal() },
    { label: 'New routine', hint: 'command', iconName: 'sync', keywords: 'routine schedule new', action: () => openRoutineModal() },
    { label: 'Home', hint: 'go to', iconName: 'home', keywords: 'home updates digest', action: () => go('home') },
    { label: 'Repositories', hint: 'go to', iconName: 'repo', keywords: 'repos projects', action: () => go('repos') },
    { label: 'Routines', hint: 'go to', iconName: 'sync', keywords: 'routines schedule', action: () => go('routines') },
    { label: 'Runs', hint: 'go to', iconName: 'terminal', keywords: 'runs tasks background', action: () => go('runs') },
    { label: 'Stats', hint: 'go to', iconName: 'graph', keywords: 'stats usage tokens activity', action: () => go('stats') },
    { label: 'Settings', hint: 'go to', iconName: 'gear', keywords: 'settings notifications slack discord telegram webhooks', action: () => go('settings') },
  ]
  renderPaletteList('')
}

function closePalette() {
  palette.open = false
  $('#palette-backdrop').classList.add('hidden')
}

function paletteMatches(query) {
  const q = query.trim().toLowerCase()
  if (!q) return palette.items
  return palette.items.filter((item) => (item.label.toLowerCase() + ' ' + item.keywords).includes(q))
}

function renderPaletteList(query) {
  const matches = paletteMatches(query).slice(0, 12)
  palette.matches = matches
  palette.selected = Math.min(palette.selected, Math.max(matches.length - 1, 0))
  $('#palette-list').innerHTML = matches
    .map((item, i) => `
      <div class="palette-item ${i === palette.selected ? 'selected' : ''}" data-idx="${i}">
        ${icon(item.iconName, 15)}
        <span class="plabel">${esc(item.label)}</span>
        <span class="hintk">${esc(item.hint)}</span>
      </div>`)
    .join('') || '<div class="empty" style="padding:18px">No matches</div>'
  $('#palette-list').querySelectorAll('.palette-item').forEach((el) =>
    el.addEventListener('click', () => pickPalette(Number(el.dataset.idx)))
  )
}

function pickPalette(idx) {
  const item = palette.matches[idx]
  closePalette()
  if (item) item.action()
}

$('#palette-trigger').addEventListener('click', openPalette)
$('#palette-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'palette-backdrop') closePalette()
})
$('#palette-input').addEventListener('input', (e) => {
  palette.selected = 0
  renderPaletteList(e.target.value)
})
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    palette.open ? closePalette() : openPalette()
    return
  }
  if (!palette.open) return
  if (e.key === 'Escape') closePalette()
  if (e.key === 'ArrowDown') { e.preventDefault(); palette.selected = Math.min(palette.selected + 1, palette.matches.length - 1); renderPaletteList($('#palette-input').value) }
  if (e.key === 'ArrowUp') { e.preventDefault(); palette.selected = Math.max(palette.selected - 1, 0); renderPaletteList($('#palette-input').value) }
  if (e.key === 'Enter') pickPalette(palette.selected)
})

/* ---------- navigation + polling ---------- */

const pages = {
  home: renderHome,
  repos: renderRepos,
  routines: renderRoutines,
  runs: renderRuns,
  stats: renderStats,
  settings: renderSettings,
  hq: renderHQ,
}

const NAV = [
  { page: 'home', label: 'Home', iconName: 'home' },
  { page: 'repos', label: 'Repositories', iconName: 'repo' },
  { page: 'routines', label: 'Routines', iconName: 'sync' },
  { page: 'runs', label: 'Runs', iconName: 'terminal' },
  { page: 'stats', label: 'Stats', iconName: 'graph' },
  { page: 'settings', label: 'Settings', iconName: 'gear' },
]

function renderNav() {
  $('#nav-main').innerHTML = NAV.map((n) => `
    <button data-page="${n.page}" class="${state.page === n.page ? 'active' : ''}">
      ${icon(n.iconName, 15)}<span class="nav-label">${n.label}</span>
    </button>`).join('')
  $('#nav-main').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.page))
  )
}

function go(page) {
  state.page = page
  renderNav()
  refreshSidebarRepos()
  render()
}

function openHQ(path) {
  state.hqRepo = path
  go('hq')
}

function render() {
  pages[state.page]().catch((err) => {
    main.innerHTML = `<div class="page"><div class="empty">Error: ${esc(err.message)}</div></div>`
  })
}

$('#brand').addEventListener('click', () => go('home'))

let sidebarRepos = []
async function refreshSidebarRepos() {
  try {
    const [repos, runs] = await Promise.all([api('/api/projects'), api('/api/runs')])
    const running = runs.filter((r) => r.status === 'running').length
    $('#running-indicator').classList.toggle('hidden', running === 0)
    $('#running-count').textContent = running
    sidebarRepos = repos.filter((r) => r.exists).slice(0, 8)
    $('#nav-repos').innerHTML = sidebarRepos.map((r) => `
      <button data-hq="${esc(r.path)}" class="${state.page === 'hq' && state.hqRepo === r.path ? 'active' : ''}">
        ${icon('chat', 14)}<span class="nav-label">${esc(repoName(r.path))}</span>
        ${r.isActive ? '<span class="dot green pulse" style="margin-left:auto"></span>' : ''}
      </button>`).join('')
    $('#nav-repos').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => openHQ(b.dataset.hq))
    )
  } catch { /* server briefly unavailable */ }
}

renderNav()
render()
refreshSidebarRepos()
setInterval(() => {
  refreshSidebarRepos()
  if (!$('#modal-backdrop').classList.contains('hidden') || palette.open) return
  if (state.page === 'home') render()
  if (state.page === 'hq' && !state.chatBusy) renderHQRail()
}, 6000)
