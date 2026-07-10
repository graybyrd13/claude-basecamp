/* Basecamp — vanilla JS app, no build step. */

const state = {
  page: 'chat',
  chatTarget: 'global',
  repoFocus: null,
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
  plus: '<path fill="currentColor" d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>',
  shield: '<path fill="currentColor" d="M7.467.133a1.748 1.748 0 0 1 1.066 0l5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667Zm.61 1.429a.25.25 0 0 0-.153 0l-5.25 1.68a.25.25 0 0 0-.174.238V7c0 1.358.275 2.666 1.057 3.86.784 1.194 2.121 2.34 4.366 3.297a.196.196 0 0 0 .154 0c2.245-.956 3.582-2.104 4.366-3.298C13.225 9.666 13.5 8.36 13.5 7V3.48a.251.251 0 0 0-.174-.237l-5.25-1.68ZM8 5a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 8 5Z"/>',
  pulse: '<path fill="currentColor" d="M6 2c.353 0 .66.246.735.591L8.6 11.19l1.166-3.5A.75.75 0 0 1 10.48 7.2h4.77a.75.75 0 0 1 0 1.5h-4.229l-1.81 5.428a.75.75 0 0 1-1.446-.046L5.9 5.51l-1.168 4.09A.75.75 0 0 1 4.01 10.15H.75a.75.75 0 0 1 0-1.5h2.696l1.82-6.104A.75.75 0 0 1 6 2Z"/>',
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
// Project paths are real filesystem paths — backslash-separated on Windows —
// so split on either separator instead of assuming POSIX '/'.
const repoName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || p
const describeDenials = (run) => {
  const denials = run.permissionDenials || []
  if (!denials.length) return 'Requested a permission this run does not have.'
  return denials
    .map((d) => {
      const input = d.tool_input || {}
      if (d.tool_name === 'Bash') return `Bash: ${input.command || ''}`.slice(0, 140)
      if (input.file_path) return `${d.tool_name}: ${input.file_path}`
      return d.tool_name
    })
    .join('; ')
}
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

const cleanRoomChip = (room) =>
  ({
    open: `<span class="chip green">${icon('branch', 11)}clean room</span>`,
    applied: `<span class="chip">${icon('check', 11)}applied</span>`,
    discarded: `<span class="chip">discarded</span>`,
  })[room?.state] || ''

/** Apply / discard / view-diff buttons share wiring across Home and Runs. */
function wireCleanRoomButtons(root, refresh) {
  root.querySelectorAll('[data-apply-run]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      el.disabled = true
      try {
        await api(`/api/runs/${el.dataset.applyRun}/apply`, { method: 'POST' })
      } catch (err) {
        alert(`Apply failed: ${err.message}`)
      }
      refresh()
    })
  )
  root.querySelectorAll('[data-discard-run]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm('Discard this clean room? Its commits are deleted.')) return
      el.disabled = true
      try {
        await api(`/api/runs/${el.dataset.discardRun}/discard`, { method: 'POST' })
      } catch (err) {
        alert(`Discard failed: ${err.message}`)
      }
      refresh()
    })
  )
  root.querySelectorAll('[data-diff-run]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      const res = await fetch(`/api/runs/${el.dataset.diffRun}/diff`)
      const patch = await res.text()
      openModal(`
        <h2>Clean room diff</h2>
        <div class="log-view" style="max-height:60vh">${esc(patch || 'Empty diff.')}</div>
        <div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>`)
    })
  )
}

const statusChip = (status) =>
  ({
    running: `<span class="chip green"><span class="dot green pulse"></span>running</span>`,
    succeeded: `<span class="chip green">${icon('check', 12)}done</span>`,
    failed: `<span class="chip red">${icon('x', 12)}failed</span>`,
    stopped: `<span class="chip">stopped</span>`,
    'awaiting-approval': `<span class="chip">${icon('clock', 12)}needs approval</span>`,
    denied: `<span class="chip">denied</span>`,
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

// Models actually used on this machine (from /api/models), fetched once per page load.
let modelDataPromise = null
function getModelData() {
  if (!modelDataPromise) {
    modelDataPromise = api('/api/models').catch(() => ({
      models: [],
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    }))
  }
  return modelDataPromise
}

const modelOptions = (models, selected = '') =>
  `<option value="">Your Claude Code default</option>` +
  models
    .map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.label)}</option>`)
    .join('')

const effortOptions = (efforts, selected = '') =>
  `<option value="">Default effort</option>` +
  efforts
    .map((e) => `<option value="${esc(e)}" ${e === selected ? 'selected' : ''}>${esc(e)}</option>`)
    .join('')

const modelPermissionFields = ({ models, efforts }) => `
  <div class="field-row">
    <label class="field">Model
      <select name="model">${modelOptions(models)}</select>
    </label>
    <label class="field">Effort
      <select name="effort">${effortOptions(efforts)}</select>
    </label>
    <label class="field">Permissions
      <select name="permissionMode">${PERMISSION_OPTIONS}</select>
    </label>
  </div>`

/** Compact settings popover shared by the chat landing and HQ composers. */
const chatSettingsPanel = ({ models, efforts }, variant = '') => `
  <div class="chat-settings-anchor">
    <button type="button" class="icon-btn" id="chat-settings-btn" title="Model, effort & permissions" aria-label="Chat settings">${icon('gear', 15)}</button>
    <div class="chat-settings hidden ${variant}" id="chat-settings">
      <label class="field">Model
        <select id="chat-model">${modelOptions(models)}</select>
      </label>
      <label class="field">Effort
        <select id="chat-effort">${effortOptions(efforts)}</select>
      </label>
      <label class="field">Permissions
        <select id="chat-permission">${PERMISSION_OPTIONS}</select>
      </label>
    </div>
  </div>`

// One delegated listener drives the popover on both chat surfaces: the gear
// toggles it, any click outside closes it. Renders swap #main's DOM, so a
// per-render listener would stack — this one is installed once.
document.addEventListener('click', (e) => {
  const panel = $('#chat-settings')
  if (!panel) return
  if (e.target.closest('#chat-settings-btn')) {
    panel.classList.toggle('hidden')
    return
  }
  if (!panel.classList.contains('hidden') && !e.target.closest('#chat-settings')) {
    panel.classList.add('hidden')
  }
})

async function openTaskModal(repoPath = null, presetPrompt = '') {
  const [repos, modelData] = await Promise.all([api('/api/projects'), getModelData()])
  openModal(`
    <h2>Run a background task</h2>
    <form id="task-form">
      <label class="field">Repository
        <select name="projectPath">${repoOptions(repos, repoPath)}</select>
      </label>
      <label class="field">What should Claude do?
        <textarea name="prompt" required placeholder="e.g. Review TODO.md and continue development on the next unchecked item. Run the tests, and commit your work when they pass.">${esc(presetPrompt)}</textarea>
      </label>
      ${modelPermissionFields(modelData)}
      <label class="field" style="display:flex;align-items:center;gap:8px;font-weight:500">
        <input type="checkbox" name="cleanRoom" style="width:auto;margin:0" />
        Clean room — work in an isolated git worktree; changes come back as a diff to apply
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">Run now</button>
      </div>
    </form>`)
  wireModalForm('#task-form', async (fields) => {
    await api('/api/runs', {
      method: 'POST',
      body: {
        ...fields,
        model: fields.model || null,
        effort: fields.effort || null,
        isolation: fields.cleanRoom ? 'worktree' : null,
      },
    })
    go('runs')
  })
}

/** routine may be a saved routine (has .id → edit) or a template draft (no .id → create prefilled). */
async function openRoutineModal(routine = null, presetRepo = null) {
  const [repos, modelData] = await Promise.all([api('/api/projects'), getModelData()])
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
      ${modelPermissionFields(modelData)}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${routine?.id ? 'Save' : 'Create routine'}</button>
      </div>
    </form>`)
  if (routine?.permissionMode) $('#routine-form [name=permissionMode]').value = routine.permissionMode
  if (routine) $('#routine-form [name=model]').value = routine.model || ''
  if (routine) $('#routine-form [name=effort]').value = routine.effort || ''
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
      effort: fields.effort || null,
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

/* ---------- Chat landing (default page) ---------- */

async function renderChat() {
  state.chatTarget = 'global'
  const modelData = await getModelData()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  main.innerHTML = `
    <div class="hq">
      <div class="hq-head">
        <span style="color:var(--muted)">${icon('chat', 16)}</span>
        <h1>${greeting}</h1>
        <span class="muted" style="font-size:12.5px">your manager — one persistent agent across every repo on this machine</span>
        <span style="flex:1"></span>
        <button class="btn small" id="chat-compact" title="Collapse the conversation into a handoff brief; the next message starts a fresh session seeded with it">Compact</button>
        <button class="btn small danger" id="chat-clear" title="Hide the history and start a fresh session">Clear</button>
      </div>
      <div class="hq-body">
        <div class="chat-col">
          <div class="chat-scroll" id="chat-scroll">
            <div class="chat-thread" id="chat-thread"><div class="empty">Loading…</div></div>
          </div>
          <div class="composer">
            <div class="composer-inner">
              ${chatSettingsPanel(modelData)}
              <textarea id="chat-input" rows="1" placeholder="What are we working on?"></textarea>
              <button class="btn primary" id="chat-send">Send</button>
            </div>
            <div class="hint">Full Claude Code tools across every repo and folder on this machine. It can schedule routines, track goals, launch runs, and create checks in any repo. Durable notes: ~/.claude-basecamp/MANAGER.md.</div>
          </div>
        </div>
      </div>
    </div>`

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
  $('#chat-compact').addEventListener('click', async () => {
    if (state.chatBusy) return alert('Wait for the manager to finish its current turn.')
    if (!confirm('Compact the conversation? It collapses into a handoff brief the next session starts from.')) return
    const btn = $('#chat-compact')
    btn.disabled = true
    btn.textContent = 'Compacting…'
    try {
      await api('/api/chat/compact', { method: 'POST', body: { project: state.chatTarget } })
      await loadChatHistory()
    } catch (err) {
      alert(err.message)
    }
    if ($('#chat-compact')) {
      $('#chat-compact').disabled = false
      $('#chat-compact').textContent = 'Compact'
    }
  })
  $('#chat-clear').addEventListener('click', async () => {
    if (state.chatBusy) return alert('Wait for the manager to finish its current turn.')
    if (!confirm('Clear the conversation? History hides and the next message starts a fresh session.')) return
    await api('/api/chat/clear', { method: 'POST', body: { project: state.chatTarget } })
    await loadChatHistory()
  })
  await loadChatHistory()
  input.focus()
}

/* ---------- Home ---------- */

function userIsTyping() {
  const el = document.activeElement
  return el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT')
}

async function renderHome(force = false) {
  const [overview, updates, runs, routines, digest, rescue, report, intents, budget] = await Promise.all([
    api('/api/overview'),
    api('/api/updates'),
    api('/api/runs'),
    api('/api/routines'),
    api('/api/digest'),
    api('/api/rescue').catch(() => []),
    api('/api/intents/report').catch(() => null),
    api('/api/intents').catch(() => []),
    api('/api/budget').catch(() => null),
  ])
  // Re-render only when something actually changed — a silent poll must never
  // wipe scroll position or a half-typed decision.
  const snapshot = JSON.stringify([overview, updates.slice(0, 25), runs.slice(0, 45), routines, digest, rescue, report, budget])
  if (!force && snapshot === renderHome._snapshot) return
  if (!force && userIsTyping()) return
  renderHome._snapshot = snapshot

  const running = runs.filter((r) => r.status === 'running')
  const awaiting = runs.filter((r) => r.status === 'awaiting-approval')
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
          <p class="subtitle">${overview.activeSessions.length} active session${overview.activeSessions.length === 1 ? '' : 's'} · ${running.length} background run${running.length === 1 ? '' : 's'} · ${routines.filter((r) => r.enabled).length} routine${routines.filter((r) => r.enabled).length === 1 ? '' : 's'} armed${awaiting.length ? ` · ${awaiting.length} awaiting approval` : ''}</p>
        </div>
        <button class="btn primary" id="new-task">${icon('play', 14)}Run a task</button>
      </div>

      ${report && report.total > 0 ? `
        <div class="digest" style="border-left-color:${report.decisions.length ? 'var(--red)' : report.drifting ? 'var(--attention)' : 'var(--green)'}">
          <div class="d-head">${icon('pulse', 15)} Checks
            <span class="muted" style="font-weight:400">
              ${report.holding} passing${report.converging ? ` · ${report.converging} fixing` : ''}${report.fixReady?.length ? ` · ${report.fixReady.length} fix ready` : ''}${report.drifting ? ` · ${report.drifting} failing` : ''}${report.budgetPaused ? ` · ${report.budgetPaused} over budget` : ''}${report.unknown ? ` · ${report.unknown} unknown` : ''}
            </span>
            <button class="btn small" style="margin-left:auto" data-page-link="intents">All checks</button>
          </div>
          ${report.decisions.map((i) => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-top:8px">
              <div style="font-weight:600;font-size:13px">Decision needed: ${esc(i.label)} <span class="muted" style="font-weight:400">· ${esc(repoName(i.projectPath))}</span></div>
              <div class="muted" style="font-size:12.5px;margin:4px 0 8px">${esc((i.lastDetail || '').slice(0, 240))}</div>
              <div style="display:flex;gap:8px">
                <input data-decision-input="${i.id}" placeholder="Your decision — e.g. take the major upgrade, pin the rest" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font:inherit;font-size:12.5px;padding:5px 9px" />
                <button class="btn small primary" data-decide="${i.id}">Decide</button>
              </div>
            </div>`).join('')}
          ${(report.fixReady || []).map((i) => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-top:8px">
              <div style="font-weight:600;font-size:13px">Fix ready: ${esc(i.label)} <span class="muted" style="font-weight:400">· ${esc(repoName(i.projectPath))}</span></div>
              <div class="muted" style="font-size:12.5px;margin:4px 0 8px">Converged in a clean room — your checkout is untouched. ${esc((i.lastDetail || '').slice(0, 180))}</div>
              <div style="display:flex;gap:8px">
                <button class="btn small" data-diff-run="${i.lastRunId}">View diff</button>
                <button class="btn small primary" data-apply-run="${i.lastRunId}">Apply</button>
                <button class="btn small danger" data-discard-run="${i.lastRunId}">Discard</button>
              </div>
            </div>`).join('')}
        </div>` : ''}

      ${budget && (budget.monthlyBudgetUsd > 0 || budget.spend.totalUsd > 0) ? `
        <div class="box box-pad" style="display:flex;align-items:center;gap:12px;padding:10px 14px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">${icon('pulse', 14)} Autonomy spend</span>
          <span class="muted" style="font-size:12.5px">$${budget.spend.totalUsd.toFixed(2)} this month${budget.monthlyBudgetUsd ? ` of $${Number(budget.monthlyBudgetUsd).toFixed(2)} cap` : ' — no cap set'} · ${budget.spend.runs} run${budget.spend.runs === 1 ? '' : 's'}</span>
          ${budget.monthlyBudgetUsd ? `
            <div style="flex:1;min-width:120px;max-width:220px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${Math.min(100, (budget.spend.totalUsd / budget.monthlyBudgetUsd) * 100).toFixed(0)}%;background:${budget.spend.totalUsd >= budget.monthlyBudgetUsd ? 'var(--red)' : 'var(--green)'}"></div>
            </div>` : ''}
          <button class="btn small" style="margin-left:auto" data-page-link="settings">Budgets</button>
        </div>` : ''}

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

      ${awaiting.length ? `
        <div class="box">
          <div class="box-head">${icon('stop', 14)} Awaiting approval <span class="count">${awaiting.length}</span></div>
          ${awaiting.map((r) => `
            <div class="row" data-run="${r.id}">
              <div class="grow">
                <div class="title">${esc(r.routineName || repoName(r.projectPath))}</div>
                <div class="sub mono">${esc(describeDenials(r))}</div>
              </div>
              <button class="btn small" data-approve="${r.id}">Approve</button>
              <button class="btn small danger" data-deny="${r.id}">Deny</button>
            </div>`).join('')}
        </div>` : ''}

      ${rescue.length ? `
        <div class="box">
          <div class="box-head">${icon('pulse', 14)} Unfinished work <span class="count">${rescue.length}</span></div>
          ${rescue.map((c) => `
            <div class="row">
              <div class="grow">
                <div class="title">${esc((c.title || c.sessionId.slice(0, 8)).slice(0, 70))}
                  <span class="chip">${esc(c.reason)}</span>
                </div>
                <div class="sub">${esc(repoName(c.projectPath))} · ${fmtTime(c.lastActivity)} · ${esc(c.detail)}</div>
              </div>
              <button class="btn small primary" data-rescue-session="${esc(c.sessionId)}" data-rescue-path="${esc(c.projectPath)}">Rescue</button>
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
  main.querySelectorAll('[data-page-link]').forEach((el) =>
    el.addEventListener('click', () => go(el.dataset.pageLink))
  )
  wireCleanRoomButtons(main, () => renderHome(true))
  main.querySelectorAll('[data-decide]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const input = main.querySelector(`[data-decision-input="${btn.dataset.decide}"]`)
      const decision = input?.value.trim()
      if (!decision) return input?.focus()
      btn.disabled = true
      btn.textContent = 'Launching…'
      try {
        await api(`/api/intents/${btn.dataset.decide}/decide`, { method: 'POST', body: { decision } })
        go('runs')
      } catch (err) {
        btn.disabled = false
        btn.textContent = 'Decide'
        alert(err.message)
      }
    })
  )
  main.querySelectorAll('[data-rescue-session]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = 'Rescuing…'
      try {
        await api('/api/rescue', {
          method: 'POST',
          body: { sessionId: btn.dataset.rescueSession, projectPath: btn.dataset.rescuePath },
        })
        go('runs')
      } catch (err) {
        btn.disabled = false
        btn.textContent = 'Rescue'
        alert(err.message)
      }
    })
  )
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
  main.querySelectorAll('[data-approve]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      await api(`/api/runs/${el.dataset.approve}/approve`, { method: 'POST' })
      renderHome()
    })
  )
  main.querySelectorAll('[data-deny]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm('Deny this request? The run will stop here.')) return
      await api(`/api/runs/${el.dataset.deny}/deny`, { method: 'POST' })
      renderHome()
    })
  )
}

/* ---------- Repos ---------- */

async function renderRepos() {
  if (!renderRepos._loaded) {
    main.innerHTML = '<div class="page"><h1>Repos</h1><p class="subtitle">Loading…</p></div>'
  }
  const [repos, intents, budget, runs] = await Promise.all([
    api('/api/projects?git=1'),
    api('/api/intents').catch(() => []),
    api('/api/budget').catch(() => null),
    api('/api/runs').catch(() => []),
  ])
  renderRepos._loaded = true

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Repos</h1><p class="subtitle">Every repository, its state, and the agents working in it. Click a repo to open its agents; talk to the manager in Chat.</p></div>
        <button class="btn primary" id="new-task">${icon('play', 14)}Run a task</button>
      </div>
      ${repos.map((r) => repoCard(r, { intents, budget, runs, expanded: r.path === state.repoFocus })).join('')}
      ${repos.length === 0 ? '<div class="box"><div class="empty">No repositories found. Run Claude Code in a project first.</div></div>' : ''}
    </div>`

  $('#new-task')?.addEventListener('click', () => openTaskModal())
  main.querySelectorAll('[data-repo-toggle]').forEach((el) =>
    el.addEventListener('click', () => {
      state.repoFocus = state.repoFocus === el.dataset.repoToggle ? null : el.dataset.repoToggle
      renderRepos()
    })
  )
  main.querySelectorAll('[data-monitor-run]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      openRunMonitor(el.dataset.monitorRun)
    })
  )
  main.querySelectorAll('[data-run-task]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      openTaskModal(el.dataset.runTask)
    })
  )
  main.querySelectorAll('[data-new-check]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      openIntentModal(el.dataset.newCheck)
    })
  )
  if (state.repoFocus) loadRepoDetail(state.repoFocus)
}

const cssId = (path) => path.replace(/[^a-zA-Z0-9]/g, '-')

function repoCard(r, { intents, budget, runs, expanded }) {
  const checks = intents.filter((i) => i.projectPath === r.path)
  const holding = checks.filter((i) => i.enabled && i.lastStatus === 'holding').length
  const attention = checks.filter((i) =>
    ['drifting', 'decision-needed', 'budget-paused', 'fix-ready'].includes(i.lastStatus)
  ).length
  const spend = Number(budget?.spend.byRepo[r.path]) || 0
  const repoRuns = runs.filter((x) => x.projectPath === r.path)
  const live = repoRuns.filter((x) => x.status === 'running' || x.status === 'awaiting-approval')
  const settled = repoRuns.filter((x) => x.status !== 'running' && x.status !== 'awaiting-approval')

  return `
    <div class="box" style="margin-bottom:10px">
      <div class="row clickable" data-repo-toggle="${esc(r.path)}">
        <span style="color:var(--muted)">${icon('repo', 16)}</span>
        <div class="grow">
          <div class="title">${esc(repoName(r.path))}
            ${r.isActive ? '<span class="chip green"><span class="dot green pulse"></span>active</span>' : ''}
            ${gitChips(r.git)}
            ${live.length ? `<span class="chip green"><span class="dot green pulse"></span>${live.length} agent${live.length === 1 ? '' : 's'} live</span>` : ''}
            ${attention ? `<span class="chip" style="color:var(--attention);border-color:var(--attention)">${attention} need${attention === 1 ? 's' : ''} attention</span>` : ''}
          </div>
          <div class="sub">${r.sessionCount} session${r.sessionCount === 1 ? '' : 's'}${checks.length ? ` · ${checks.length} check${checks.length === 1 ? '' : 's'} (${holding} passing)` : ''}${spend ? ` · $${spend.toFixed(2)} this month` : ''} · ${fmtTime(r.lastModified)}</div>
        </div>
        <span class="muted" style="font-size:15px">${expanded ? '−' : '+'}</span>
      </div>
      ${expanded ? repoAgents(r, { checks, live, settled }) : ''}
    </div>`
}

function repoAgents(r, { checks, live, settled }) {
  const runRow = (x, isLive) => `
    <div class="rail-item clickable" data-monitor-run="${x.id}" title="Monitor this agent">
      <div class="t"><span>${esc((x.routineName || x.prompt || '').slice(0, 46))}</span>${statusChip(x.status)}${x.cleanRoom ? cleanRoomChip(x.cleanRoom) : ''}</div>
      <div class="s">${isLive ? `${fmtDuration(x.startedAt)} elapsed` : fmtTime(x.startedAt)}${(x.commits || []).length ? ` · ${x.commits.length} commit${x.commits.length === 1 ? '' : 's'}` : ''}${x.costUsd ? ` · $${x.costUsd.toFixed(2)}` : ''}</div>
    </div>`
  return `
    <div style="padding:2px 14px 12px">
      <h2 style="margin-top:8px">Agents</h2>
      ${live.map((x) => runRow(x, true)).join('')}
      ${settled.slice(0, 6).map((x) => runRow(x, false)).join('')}
      ${live.length + settled.length === 0 ? '<div class="faint" style="font-size:12px">No agents have run here yet.</div>' : ''}
      <div style="display:flex;gap:8px;margin:10px 0 2px">
        <button class="btn small" data-run-task="${esc(r.path)}">${icon('play', 12)}Run a task</button>
        <button class="btn small" data-new-check="${esc(r.path)}">${icon('pulse', 12)}New check</button>
      </div>
      ${checks.length ? `
        <h2>Checks</h2>
        ${checks.map((i) => `
          <div class="rail-item">
            <div class="t"><span>${esc(i.label)}</span>${intentStatusChip(i.enabled ? i.lastStatus : 'paused')}</div>
            <div class="s">${i.lastDetail ? esc(i.lastDetail.split('\n')[0].slice(0, 90)) : 'not checked yet'}</div>
          </div>`).join('')}` : ''}
      <div id="repo-detail-${cssId(r.path)}"></div>
    </div>`
}

/** Goals and recent sessions load after the card opens — they need extra requests. */
async function loadRepoDetail(path) {
  const el = $(`#repo-detail-${cssId(path)}`)
  if (!el) return
  const [goals, sessions] = await Promise.all([
    api(`/api/goals?project=${encodeURIComponent(path)}`).catch(() => []),
    api(`/api/repo/sessions?path=${encodeURIComponent(path)}`).catch(() => []),
  ])
  if (!$(`#repo-detail-${cssId(path)}`)) return
  el.innerHTML = `
    ${goals.length ? `
      <h2>Goals</h2>
      ${goals.map((g) => `
        <div class="rail-item ${g.status === 'done' ? 'goal-done' : ''}">
          <div class="t">
            <span class="goal-toggle" data-goal="${g.id}" data-status="${g.status}">
              ${icon(g.status === 'done' ? 'checkboxOn' : 'checkbox', 14)}
              <span>${esc(g.title)}</span>
            </span>
          </div>
        </div>`).join('')}` : ''}
    ${sessions.length ? `
      <h2>Recent sessions</h2>
      ${sessions.slice(0, 5).map((s) => `
        <div class="rail-item clickable" data-open-session="${esc(s.projectId)}::${esc(s.id)}" data-session-time="${s.lastModified}">
          <div class="t"><span class="mono ${s.isActive ? '' : 'muted'}">${esc(s.id.slice(0, 8))}</span>${s.isActive ? '<span class="chip green"><span class="dot green pulse"></span>active</span>' : ''}</div>
          <div class="s">${fmtTime(s.lastModified)} · ${(s.bytes / 1024).toFixed(0)} KB</div>
        </div>`).join('')}` : ''}`
  el.querySelectorAll('[data-goal]').forEach((g) =>
    g.addEventListener('click', async () => {
      await api(`/api/goals/${g.dataset.goal}`, {
        method: 'PUT',
        body: { status: g.dataset.status === 'done' ? 'open' : 'done' },
      })
      loadRepoDetail(path)
    })
  )
  el.querySelectorAll('[data-open-session]').forEach((s) =>
    s.addEventListener('click', () => {
      const [projectId, sessionId] = s.dataset.openSession.split('::')
      openSessionCard({ projectId, sessionId, path, lastModified: Number(s.dataset.sessionTime), title: null, snippet: null })
    })
  )
}

/** Live view of one agent: status, log tail, and the actions its state allows. */
async function openRunMonitor(runId) {
  let timer = null
  openModal(`
    <h2 style="display:flex;align-items:center;gap:8px">Agent <span id="mon-status"></span></h2>
    <div class="sub mono" id="mon-meta" style="margin-bottom:8px"></div>
    <div class="log-view" id="mon-log" style="max-height:50vh;min-height:160px">Loading…</div>
    <div class="modal-actions">
      <button type="button" class="btn" data-close>Close</button>
      <span style="flex:1"></span>
      <span id="mon-actions" style="display:flex;gap:8px"></span>
    </div>`)
  const refresh = async () => {
    if (!$('#mon-log')) {
      clearInterval(timer)
      return
    }
    try {
      const [run, log] = await Promise.all([api(`/api/runs/${runId}`), api(`/api/runs/${runId}/log`)])
      $('#mon-status').innerHTML = statusChip(run.status) + (run.cleanRoom ? cleanRoomChip(run.cleanRoom) : '')
      $('#mon-meta').textContent = `${repoName(run.projectPath)} · ${(run.routineName || run.prompt || '').slice(0, 90)}${run.costUsd ? ` · $${run.costUsd.toFixed(2)}` : ''}`
      const logEl = $('#mon-log')
      const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 24
      logEl.textContent = log.log || '(no output yet)'
      if (stick) logEl.scrollTop = logEl.scrollHeight
      $('#mon-actions').innerHTML = `
        ${run.status === 'running' ? '<button class="btn small danger" id="mon-stop">Stop</button>' : ''}
        ${run.status === 'awaiting-approval' ? '<button class="btn small primary" id="mon-approve">Approve</button><button class="btn small danger" id="mon-deny">Deny</button>' : ''}
        ${run.status === 'succeeded' && run.cleanRoom?.state === 'open' ? `<button class="btn small" data-diff-run="${run.id}">View diff</button><button class="btn small primary" data-apply-run="${run.id}">Apply</button><button class="btn small danger" data-discard-run="${run.id}">Discard</button>` : ''}`
      $('#mon-stop')?.addEventListener('click', async () => {
        await api(`/api/runs/${runId}/stop`, { method: 'POST' })
        refresh()
      })
      $('#mon-approve')?.addEventListener('click', async () => {
        await api(`/api/runs/${runId}/approve`, { method: 'POST' })
        refresh()
      })
      $('#mon-deny')?.addEventListener('click', async () => {
        await api(`/api/runs/${runId}/deny`, { method: 'POST' })
        refresh()
      })
      wireCleanRoomButtons($('#mon-actions'), refresh)
    } catch {
      /* run vanished mid-poll */
    }
  }
  await refresh()
  timer = setInterval(refresh, 2000)
}

/* ---------- chat machinery (shared by the global manager page) ---------- */

function chatBubble(role, html) {
  const who = role === 'user' ? 'you' : role === 'summary' ? 'compacted — handoff brief' : 'manager'
  return `<div class="msg ${role === 'summary' ? 'assistant' : role}">
    <div class="who">${who}</div>
    <div class="bubble">${html}</div>
  </div>`
}

async function loadChatHistory() {
  const thread = $('#chat-thread')
  try {
    const { messages, busy, model, effort, permissionMode } = await api(`/api/chat/history?project=${encodeURIComponent(state.chatTarget)}`)
    state.chatBusy = busy
    applyChatPrefs(model, effort, permissionMode)
    if (!messages.length) {
      thread.innerHTML = `
        <div class="empty">
          Your manager. One persistent agent with full access to every repo and folder on this machine.<br/><br/>
          <span class="muted">"What needs my attention across all repos?"<br/>
          "Set up nightly tests for basecamp and keep its deps fresh."<br/>
          "Our goal is to ship v1 of the Roblox game by end of month — track it."</span>
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

/** Preselect the repo's last-used chat prefs. An API-set model outside the
 *  discovered list gets its own option rather than being silently clobbered. */
function applyChatPrefs(model, effort, permissionMode) {
  const modelSelect = $('#chat-model')
  const effortSelect = $('#chat-effort')
  const permissionSelect = $('#chat-permission')
  if (!modelSelect || !effortSelect || !permissionSelect) return
  const value = model || ''
  modelSelect.value = value
  if (modelSelect.value !== value) {
    modelSelect.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(value)}</option>`)
    modelSelect.value = value
  }
  effortSelect.value = effort || ''
  permissionSelect.value = permissionMode || 'acceptEdits'
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
      body: JSON.stringify({
        projectPath: state.chatTarget,
        message,
        model: $('#chat-model')?.value || null,
        effort: $('#chat-effort')?.value || null,
        permissionMode: $('#chat-permission')?.value || 'acceptEdits',
      }),
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
  if ($('#chat-send')) $('#chat-send').disabled = false
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
                  ${r.cleanRoom ? cleanRoomChip(r.cleanRoom) : ''}
                  ${(r.commits || []).slice(0, 3).map((c) => `<span class="chip mono">${icon('commit', 11)}${esc(c.sha)}</span>`).join('')}
                </div>
                <div class="sub mono">${esc(r.prompt.slice(0, 110))}${r.cleanRoom?.stat ? ` · ${esc(r.cleanRoom.stat)}` : ''}</div>
              </div>
              <span class="muted" style="font-size:12px;text-align:right;white-space:nowrap">
                ${fmtTime(r.startedAt)}<br/>${fmtDuration(r.startedAt, r.endedAt)}${r.costUsd ? ` · $${r.costUsd.toFixed(2)}` : ''}
              </span>
              ${r.status === 'running' ? `<button class="btn small danger" data-stop="${r.id}">Stop</button>` : ''}
              ${r.status === 'awaiting-approval' ? `<button class="btn small" data-approve="${r.id}">Approve</button><button class="btn small danger" data-deny="${r.id}">Deny</button>` : ''}
              ${r.status === 'succeeded' && r.cleanRoom?.state === 'open' ? `<button class="btn small primary" data-apply-run="${r.id}">Apply</button><button class="btn small danger" data-discard-run="${r.id}">Discard</button>` : ''}
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
  wireCleanRoomButtons(main, renderRuns)
  main.querySelectorAll('[data-approve]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      await api(`/api/runs/${el.dataset.approve}/approve`, { method: 'POST' })
      renderRuns()
    })
  )
  main.querySelectorAll('[data-deny]').forEach((el) =>
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm('Deny this request? The run will stop here.')) return
      await api(`/api/runs/${el.dataset.deny}/deny`, { method: 'POST' })
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
        ${run.status === 'awaiting-approval' ? `
          <div class="box box-pad" style="margin:10px 0">
            <p><strong>Awaiting approval</strong></p>
            <p class="mono" style="margin:6px 0">${esc(describeDenials(run))}</p>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn small" id="detail-approve">Approve</button>
              <button class="btn small danger" id="detail-deny">Deny</button>
            </div>
          </div>` : ''}
        <p class="faint" style="font-size:12px;margin-top:8px">
          ${fmtDuration(run.startedAt, run.endedAt)}${run.numTurns ? ` · ${run.numTurns} turns` : ''}${run.costUsd ? ` · $${run.costUsd.toFixed(2)}` : ''}${run.error ? ` · <span style="color:var(--red)">${esc(run.error)}</span>` : ''}
        </p>
      </div>
      ${logData.log ? `<div class="log-view">${esc(logData.log)}</div>` : ''}
    `
    $('#detail-approve')?.addEventListener('click', async () => {
      await api(`/api/runs/${run.id}/approve`, { method: 'POST' })
      renderRunDetail()
    })
    $('#detail-deny')?.addEventListener('click', async () => {
      if (!confirm('Deny this request? The run will stop here.')) return
      await api(`/api/runs/${run.id}/deny`, { method: 'POST' })
      renderRunDetail()
    })
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

/* ---------- Intents (the reconciliation loop) ---------- */

const intentStatusChip = (status) =>
  ({
    holding: `<span class="chip green">${icon('check', 12)}holding</span>`,
    drifting: `<span class="chip" style="color:var(--attention);border-color:var(--attention)">drifting</span>`,
    converging: `<span class="chip green"><span class="dot green pulse"></span>converging</span>`,
    'decision-needed': `<span class="chip red">decision needed</span>`,
    'budget-paused': `<span class="chip" style="color:var(--attention);border-color:var(--attention)">over budget</span>`,
    'fix-ready': `<span class="chip green">${icon('branch', 12)}fix ready</span>`,
    unknown: `<span class="chip">unknown</span>`,
  })[status] || `<span class="chip">not checked yet</span>`

async function renderIntents() {
  const [intents, manifests] = await Promise.all([
    api('/api/intents'),
    api('/api/manifests').catch(() => []),
  ])
  const byRepo = {}
  for (const intent of intents) (byRepo[intent.projectPath] ||= []).push(intent)
  const manifestBanners = manifests.filter((m) => (m.present && !m.adopted) || m.changed || m.error)

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Checks</h1><p class="subtitle">Standing checks on your repositories. Basecamp verifies them continuously, fixes failures itself, and asks you only when a human call is needed.</p></div>
        <button class="btn primary" id="new-intent">New check</button>
      </div>
      ${manifestBanners.map((m) => `
        <div class="digest" style="border-left-color:${m.error ? 'var(--red)' : 'var(--attention)'}">
          <div class="d-head">${icon('repo', 15)} ${esc(repoName(m.path))}
            <span class="muted" style="font-weight:400">
              ${m.error
                ? `manifest error: ${esc(m.error)}`
                : m.changed
                  ? 'manifest changed since you adopted it — its checks are paused'
                  : `declares ${m.manifest.intents.length} check${m.manifest.intents.length === 1 ? '' : 's'} in .basecamp/manifest.json`}
            </span>
            <span style="margin-left:auto;display:flex;gap:6px">
              ${!m.error ? `<button class="btn small primary" data-adopt-manifest="${esc(m.path)}">${m.changed ? 'Review & re-adopt' : 'Adopt'}</button>` : ''}
              ${m.adopted ? `<button class="btn small danger" data-drop-manifest="${esc(m.path)}">Drop</button>` : ''}
            </span>
          </div>
          ${!m.error && m.manifest ? `<ul>${m.manifest.intents.map((i) => `<li>${esc(i.builtin ? i.builtin : i.text)} <span class="muted">· every ${i.intervalMinutes}m · ${i.autonomy}</span></li>`).join('')}</ul>` : ''}
        </div>`).join('')}
      ${intents.length ? Object.entries(byRepo).map(([path, list]) => `
        <div class="box">
          <div class="box-head">${icon('repo', 14)} ${esc(repoName(path))}
            <button class="btn small" style="margin-left:auto" data-export-manifest="${esc(path)}" title="Write these checks to .basecamp/manifest.json so anyone who clones this repo can adopt them">Export manifest</button>
          </div>
          ${list.map((i) => `
            <div class="row">
              <div class="grow">
                <div class="title">${esc(i.label)} ${intentStatusChip(i.enabled ? i.lastStatus : 'paused')} ${!i.enabled ? '<span class="chip">paused</span>' : ''} ${i.source === 'manifest' ? '<span class="chip">manifest</span>' : ''}</div>
                <div class="sub">${i.lastDetail ? esc(i.lastDetail.split('\n')[0].slice(0, 120)) : 'Not checked yet'} · every ${i.intervalMinutes}m${i.lastCheck ? ` · checked ${fmtTime(i.lastCheck)}` : ''}</div>
              </div>
              <span style="white-space:nowrap;display:flex;gap:6px">
                <button class="btn small" data-check="${i.id}" title="Reconcile now">${icon('sync', 12)}</button>
                <button class="btn small" data-toggle-intent="${i.id}">${i.enabled ? 'Pause' : 'Resume'}</button>
                <button class="btn small danger" data-del-intent="${i.id}">${icon('x', 12)}</button>
              </span>
            </div>`).join('')}
        </div>`).join('') : `
        <div class="box"><div class="empty">
          No checks yet. Try the builtins — tests always green, dependencies current, backlog triaged —<br/>
          or write anything in plain English: <span class="muted">"the README always documents every CLI flag."</span><br/><br/>
          You can also just tell a repo's manager: <span class="muted">"keep the tests green from now on."</span>
        </div></div>`}
    </div>`

  $('#new-intent')?.addEventListener('click', openIntentModal)
  main.querySelectorAll('[data-check]').forEach((el) =>
    el.addEventListener('click', async () => {
      el.disabled = true
      await api(`/api/intents/${el.dataset.check}/reconcile`, { method: 'POST' })
      renderIntents()
    })
  )
  main.querySelectorAll('[data-toggle-intent]').forEach((el) =>
    el.addEventListener('click', async () => {
      const intent = intents.find((i) => i.id === el.dataset.toggleIntent)
      await api(`/api/intents/${intent.id}`, { method: 'PUT', body: { enabled: !intent.enabled } })
      renderIntents()
    })
  )
  main.querySelectorAll('[data-del-intent]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Delete this check?')) return
      await api(`/api/intents/${el.dataset.delIntent}`, { method: 'DELETE' })
      renderIntents()
    })
  )
  main.querySelectorAll('[data-adopt-manifest]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Adopt this manifest? Its checks will run on the schedule it declares, with the autonomy it declares. You can drop it any time.')) return
      el.disabled = true
      try {
        await api('/api/manifest/adopt', { method: 'POST', body: { path: el.dataset.adoptManifest } })
      } catch (err) {
        alert(err.message)
      }
      renderIntents()
    })
  )
  main.querySelectorAll('[data-drop-manifest]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('Drop this manifest? Its checks are removed (your own checks stay).')) return
      await api('/api/manifest/drop', { method: 'POST', body: { path: el.dataset.dropManifest } })
      renderIntents()
    })
  )
  main.querySelectorAll('[data-export-manifest]').forEach((el) =>
    el.addEventListener('click', async () => {
      try {
        const { file } = await api('/api/manifest/export', { method: 'POST', body: { path: el.dataset.exportManifest } })
        alert(`Manifest written to ${file} — commit it and anyone who clones the repo can adopt these checks.`)
      } catch (err) {
        alert(err.message)
      }
      renderIntents()
    })
  )
}

async function openIntentModal(presetRepo = null) {
  const repos = await api('/api/projects')
  openModal(`
    <h2>New check</h2>
    <form id="intent-form">
      <label class="field">Repository
        <select name="projectPath">${repoOptions(repos, typeof presetRepo === 'string' ? presetRepo : null)}</select>
      </label>
      <label class="field">What must stay true
        <select name="kind" id="intent-kind">
          <option value="tests-green">Tests always green (runs your suite)</option>
          <option value="deps-fresh">Dependencies current (npm outdated)</option>
          <option value="backlog-triaged">Issue backlog triaged (via gh)</option>
          <option value="custom">Custom — describe it in English</option>
        </select>
      </label>
      <label class="field hidden" id="intent-text-field">Check
        <textarea name="text" placeholder="e.g. The changelog always covers every user-facing change in main."></textarea>
      </label>
      <label class="field">Check every
        <select name="intervalMinutes">
          <option value="60">hour</option>
          <option value="120" selected>2 hours</option>
          <option value="360">6 hours</option>
          <option value="720">12 hours</option>
          <option value="1440">day</option>
        </select>
      </label>
      <label class="field">When drifting
        <select name="autonomy">
          <option value="propose" selected>Propose — fix in a clean room, I review the diff</option>
          <option value="apply">Apply — fix directly in my checkout</option>
        </select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">Create check</button>
      </div>
    </form>`)
  $('#intent-kind').addEventListener('change', (e) => {
    $('#intent-text-field').classList.toggle('hidden', e.target.value !== 'custom')
  })
  wireModalForm('#intent-form', async (fields) => {
    await api('/api/intents', {
      method: 'POST',
      body: {
        projectPath: fields.projectPath,
        builtin: fields.kind === 'custom' ? null : fields.kind,
        text: fields.kind === 'custom' ? fields.text : null,
        intervalMinutes: Number(fields.intervalMinutes),
        autonomy: fields.autonomy || 'propose',
      },
    })
    render()
  })
}

/* ---------- Reflexes (the immune system) ---------- */

async function renderReflexes() {
  main.innerHTML = '<div class="page"><h1>Reflexes</h1><p class="subtitle">Loading immune memory…</p></div>'
  const [stats, antibodies] = await Promise.all([
    api('/api/reflex/stats'),
    api('/api/reflex/antibodies'),
  ])
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h1>Reflexes</h1><p class="subtitle">Basecamp mines every session for moments you pushed back, turns them into antibodies, and blocks the same mistake machine-wide — in any session, before it happens.</p></div>
        <span style="display:flex;gap:8px">
          <button class="btn" id="rescan">Scan history</button>
          ${stats.hookInstalled
            ? '<button class="btn danger" id="disarm">Disarm</button>'
            : '<button class="btn primary" id="arm">Arm reflexes</button>'}
        </span>
      </div>

      ${!stats.hookInstalled ? `
        <div class="digest" style="border-left-color:var(--attention)">
          <div class="d-head">${icon('shield', 15)} Reflexes are not armed</div>
          <div class="muted" style="font-size:13px">Arming installs a PreToolUse hook in <span class="mono">~/.claude/settings.json</span> (one-time backup kept) so every Claude session on this machine consults the immune memory before Bash/Write/Edit actions. If Basecamp isn't running, sessions behave completely normally.</div>
        </div>` : ''}

      <div class="cards">
        <div class="card"><div class="num" data-count="${stats.antibodies}">0</div><div class="label">antibodies</div></div>
        <div class="card"><div class="num" data-count="${stats.exposures}">0</div><div class="label">exposures learned from</div></div>
        <div class="card"><div class="num" data-count="${stats.checks}">0</div><div class="label">actions checked</div></div>
        <div class="card"><div class="num" style="color:${stats.blocks ? 'var(--green)' : 'inherit'}" data-count="${stats.blocks}">0</div><div class="label">mistakes prevented</div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px">
        <div class="box">
          <div class="box-head">${icon('chat', 14)} What Claude needs from you</div>
          ${stats.claudeNeeds.map((n) => `<div class="row"><div class="grow" style="font-size:13px">${esc(n)}</div></div>`).join('')}
        </div>
        <div class="box">
          <div class="box-head">${icon('shield', 14)} What to watch in Claude</div>
          ${stats.userNeeds.map((n) => `<div class="row"><div class="grow" style="font-size:13px">${esc(n)}</div></div>`).join('')}
        </div>
      </div>

      <h2>Immune memory</h2>
      ${antibodies.length ? `
        <div class="box">
          ${antibodies.slice(0, 30).map((a) => `
            <div class="row" style="${a.muted ? 'opacity:0.5' : ''}">
              <div class="grow">
                <div class="title"><span class="mono">${esc(a.pattern.match)}</span>
                  <span class="chip">${esc(a.pattern.tool)}</span>
                  <span class="chip ${a.count >= 2 && !a.muted ? 'green' : ''}">${a.count >= 2 && !a.muted ? 'blocking' : 'observing'}</span>
                  <span class="chip solid">${a.count}×</span>
                </div>
                <div class="sub">${esc((a.evidence[a.evidence.length - 1]?.quote || '').slice(0, 90))} · ${esc(a.kinds.join(', '))} · last ${fmtTime(a.lastSeen)}</div>
              </div>
              <button class="btn small" data-mute="${a.id}" data-muted="${a.muted}">${a.muted ? 'Unmute' : 'Mute'}</button>
              <button class="btn small danger" data-del-ab="${a.id}">${icon('x', 12)}</button>
            </div>`).join('')}
        </div>` : '<div class="box"><div class="empty">No antibodies yet — hit "Scan history" to mine your transcripts.</div></div>'}
    </div>`

  animateCards(main)
  $('#rescan')?.addEventListener('click', async (e) => {
    e.target.disabled = true
    e.target.textContent = 'Scanning…'
    const result = await api('/api/reflex/scan', { method: 'POST' })
    alert(`Scan complete: ${result.newSignals} new signals, ${result.antibodies} antibodies total`)
    renderReflexes()
  })
  $('#arm')?.addEventListener('click', async () => {
    if (!confirm('Install the reflex hook into ~/.claude/settings.json? A one-time backup is kept, and it is fully removable with Disarm.')) return
    await api('/api/reflex/install', { method: 'POST' })
    renderReflexes()
  })
  $('#disarm')?.addEventListener('click', async () => {
    await api('/api/reflex/uninstall', { method: 'POST' })
    renderReflexes()
  })
  main.querySelectorAll('[data-mute]').forEach((el) =>
    el.addEventListener('click', async () => {
      await api(`/api/reflex/antibodies/${el.dataset.mute}`, { method: 'PUT', body: { muted: el.dataset.muted !== 'true' } })
      renderReflexes()
    })
  )
  main.querySelectorAll('[data-del-ab]').forEach((el) =>
    el.addEventListener('click', async () => {
      await api(`/api/reflex/antibodies/${el.dataset.delAb}`, { method: 'DELETE' })
      renderReflexes()
    })
  )
}

/* ---------- Catalog ---------- */

async function renderCatalog() {
  main.innerHTML = `
    <div class="page">
      <h1>Catalog</h1>
      <p class="subtitle">One-click installs for popular connectors and skills. Community-curated — add entries via <a href="https://github.com/graybyrd13/claude-basecamp/blob/main/catalog.json" target="_blank" rel="noopener">catalog.json</a>.</p>
      <div id="catalog-body"><div class="empty">Loading catalog…</div></div>
    </div>`
  const body = $('#catalog-body')
  try {
    const { connectors, skills } = await api('/api/catalog')
    body.innerHTML = `
      <h2>Connectors (MCP servers)</h2>
      <p class="muted" style="font-size:12.5px;margin-bottom:8px">Installed into <span class="mono">~/.claude.json</span> (user scope, backed up first). Remote connectors may ask you to authenticate with <span class="mono">/mcp</span> in a Claude session afterwards.</p>
      <div class="box">${connectors.map((c) => catalogRow(c, 'connector')).join('')}</div>
      <h2>Skills</h2>
      <p class="muted" style="font-size:12.5px;margin-bottom:8px">Downloaded from <span class="mono">anthropics/skills</span> into <span class="mono">~/.claude/skills/</span>. Available in every Claude Code session immediately.</p>
      <div class="box">${skills.map((s) => catalogRow(s, 'skill')).join('')}</div>
    `
    body.querySelectorAll('[data-install]').forEach((btn) =>
      btn.addEventListener('click', () => catalogAction(btn, 'install'))
    )
    body.querySelectorAll('[data-uninstall]').forEach((btn) =>
      btn.addEventListener('click', () => catalogAction(btn, 'uninstall'))
    )
  } catch (err) {
    body.innerHTML = `<div class="empty">${esc(err.message)}</div>`
  }
}

function catalogRow(entry, kind) {
  return `
    <div class="row">
      <span style="color:var(--muted)">${icon(kind === 'connector' ? 'gear' : 'repo', 15)}</span>
      <div class="grow">
        <div class="title">${esc(entry.name)}
          ${entry.transport ? `<span class="chip">${esc(entry.transport)}</span>` : ''}
          ${entry.installed ? '<span class="chip green">installed</span>' : ''}
        </div>
        <div class="sub">${esc(entry.description)}</div>
      </div>
      ${entry.installed
        ? `<button class="btn small danger" data-uninstall="${esc(entry.id)}" data-kind="${kind}">Remove</button>`
        : `<button class="btn small primary" data-install="${esc(entry.id)}" data-kind="${kind}">Install</button>`}
    </div>`
}

async function catalogAction(btn, action) {
  const id = btn.dataset.install || btn.dataset.uninstall
  const kind = btn.dataset.kind
  if (action === 'install' && kind === 'connector' &&
      !confirm(`Install the "${id}" connector? This writes to ~/.claude.json (a backup is kept).`)) return
  if (action === 'uninstall' &&
      !confirm(`Remove "${id}"?`)) return
  btn.disabled = true
  btn.textContent = action === 'install' ? 'Installing…' : 'Removing…'
  try {
    await api(`/api/catalog/${action}`, { method: 'POST', body: { kind, id } })
    renderCatalog()
  } catch (err) {
    btn.disabled = false
    btn.textContent = action === 'install' ? 'Install' : 'Remove'
    alert(err.message)
  }
}

/* ---------- Settings ---------- */

async function renderSettings() {
  const [s, budget, repos] = await Promise.all([
    api('/api/settings'),
    api('/api/budget').catch(() => null),
    api('/api/projects').catch(() => []),
  ])
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
            Desktop notifications (macOS or Windows)
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

      <h2>Autonomy budget</h2>
      <div class="box box-pad" style="max-width:560px">
        <p class="muted" style="font-size:13px;margin-bottom:8px">Caps apply to autonomous runs — checks and routines. Runs you start yourself are never blocked. Spend is the claude CLI's own reported cost. 0 means no cap.${budget ? ` Spent this month: <strong>$${budget.spend.totalUsd.toFixed(2)}</strong> across ${budget.spend.runs} run${budget.spend.runs === 1 ? '' : 's'}.` : ''}</p>
        <form id="budget-form">
          <div class="field-row">
            <label class="field">Monthly budget (USD)
              <input name="monthlyBudgetUsd" type="number" min="0" step="0.5" value="${Number(s.monthlyBudgetUsd) || 0}" />
            </label>
            <label class="field">Max concurrent runs
              <input name="maxConcurrentRuns" type="number" min="1" step="1" value="${Number(s.maxConcurrentRuns) || 2}" />
            </label>
          </div>
          <div class="field-row">
            <label class="field">Max runs per day per check
              <input name="maxRunsPerDay" type="number" min="1" step="1" value="${Number(s.maxRunsPerDay) || 6}" />
            </label>
            <label class="field">Escalate after failed attempts
              <input name="maxFailStreak" type="number" min="1" step="1" value="${Number(s.maxFailStreak) || 2}" />
            </label>
          </div>
          ${repos.length ? `
            <div class="field" style="margin-top:4px">
              <span style="font-weight:600;font-size:13px">Per-repository caps (USD / month)</span>
              ${repos.map((r) => `
                <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
                  <span style="flex:1;font-size:13px">${esc(repoName(r.path))}
                    ${budget?.spend.byRepo[r.path] ? `<span class="muted" style="font-size:12px"> · $${Number(budget.spend.byRepo[r.path]).toFixed(2)} spent</span>` : ''}
                  </span>
                  <input data-repo-budget="${esc(r.path)}" type="number" min="0" step="0.5" value="${Number(s.repoBudgetsUsd?.[r.path]) || 0}" style="width:110px" />
                </div>`).join('')}
            </div>` : ''}
          <div class="modal-actions" style="justify-content:flex-start">
            <button type="submit" class="btn primary">Save budget</button>
            <span id="budget-status" class="muted" style="align-self:center;font-size:12.5px"></span>
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

  const budgetForm = $('#budget-form')
  budgetForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const repoBudgetsUsd = {}
    budgetForm.querySelectorAll('[data-repo-budget]').forEach((input) => {
      const cap = Number(input.value)
      if (cap > 0) repoBudgetsUsd[input.dataset.repoBudget] = cap
    })
    await api('/api/settings', {
      method: 'PUT',
      body: {
        monthlyBudgetUsd: Math.max(0, Number(budgetForm.monthlyBudgetUsd.value) || 0),
        maxConcurrentRuns: Math.max(1, Number(budgetForm.maxConcurrentRuns.value) || 2),
        maxRunsPerDay: Math.max(1, Number(budgetForm.maxRunsPerDay.value) || 6),
        maxFailStreak: Math.max(1, Number(budgetForm.maxFailStreak.value) || 2),
        repoBudgetsUsd,
      },
    })
    $('#budget-status').textContent = 'Saved'
    setTimeout(() => { $('#budget-status').textContent = '' }, 2000)
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
      hint: 'open repo',
      iconName: 'repo',
      keywords: r.path.toLowerCase(),
      action: () => openRepo(r.path),
    })),
    { label: 'Run a task', hint: 'command', iconName: 'play', keywords: 'run task new', action: () => openTaskModal() },
    { label: 'New routine', hint: 'command', iconName: 'sync', keywords: 'routine schedule new', action: () => openRoutineModal() },
    { label: 'Chat', hint: 'go to', iconName: 'chat', keywords: 'chat talk manager new message', action: () => go('chat') },
    { label: 'Home', hint: 'go to', iconName: 'home', keywords: 'home updates digest', action: () => go('home') },
    { label: 'Repositories', hint: 'go to', iconName: 'repo', keywords: 'repos projects', action: () => go('repos') },
    { label: 'Routines', hint: 'go to', iconName: 'sync', keywords: 'routines schedule', action: () => go('routines') },
    { label: 'Runs', hint: 'go to', iconName: 'terminal', keywords: 'runs tasks background', action: () => go('runs') },
    { label: 'Stats', hint: 'go to', iconName: 'graph', keywords: 'stats usage tokens activity', action: () => go('stats') },
    { label: 'Checks', hint: 'go to', iconName: 'pulse', keywords: 'checks intents reconcile desired state decisions', action: () => go('intents') },
    { label: 'Reflexes', hint: 'go to', iconName: 'shield', keywords: 'reflexes immune antibodies mistakes blocked guardian', action: () => go('reflexes') },
    { label: 'New check', hint: 'command', iconName: 'pulse', keywords: 'check declare new desired state', action: () => openIntentModal() },
    { label: 'Catalog', hint: 'go to', iconName: 'plus', keywords: 'catalog install connectors skills mcp marketplace', action: () => go('catalog') },
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
  const items = palette.items.filter((item) => (item.label.toLowerCase() + ' ' + item.keywords).includes(q))

  // Recall: sessions from your entire history that match the query.
  const recall = palette.recall
  if (recall && recall.query.toLowerCase() === q) {
    if (recall.building) {
      items.push({
        label: `Indexing your history… ${recall.progress.done}/${recall.progress.total || '?'}`,
        hint: 'recall',
        iconName: 'clock',
        keywords: '',
        action: () => {},
      })
    }
    for (const result of recall.results) {
      items.push({
        label: result.title || result.snippet || result.sessionId.slice(0, 8),
        hint: `${repoName(result.path)} · ${fmtTime(result.lastModified)}`,
        iconName: 'clock',
        keywords: '',
        action: () => openSessionCard(result),
      })
    }
  }
  return items
}

async function openSessionCard(result) {
  const summary = await api(
    `/api/session?project=${encodeURIComponent(result.projectId)}&id=${encodeURIComponent(result.sessionId)}`
  ).catch(() => null)
  const resume = `claude --resume ${result.sessionId}`
  openModal(`
    <h2>${esc(summary?.title || result.title || 'Session')}</h2>
    <p class="muted" style="font-size:12.5px;margin-bottom:10px">
      ${esc(repoName(result.path))} · ${fmtTime(result.lastModified)}${summary ? ` · ${summary.userMessages} message${summary.userMessages === 1 ? '' : 's'} · ${summary.toolCalls} tool call${summary.toolCalls === 1 ? '' : 's'}` : ''}
    </p>
    ${result.snippet ? `<div class="log-view" style="max-height:120px">${esc(result.snippet)}</div>` : ''}
    <p class="muted" style="font-size:12.5px;margin-top:10px">Resume this exact session in a terminal, inside ${esc(result.path)}:</p>
    <div class="log-view" style="max-height:none">${esc(resume)}</div>
    <div class="modal-actions">
      <button type="button" class="btn" data-close>Close</button>
      <button type="button" class="btn" id="copy-resume">Copy resume command</button>
      <button type="button" class="btn primary" id="open-manager-from-session">Open repo</button>
    </div>`)
  $('#copy-resume')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(resume)
    $('#copy-resume').textContent = 'Copied'
  })
  $('#open-manager-from-session')?.addEventListener('click', () => {
    closeModal()
    openRepo(result.path)
  })
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
let recallTimer = null
$('#palette-input').addEventListener('input', (e) => {
  palette.selected = 0
  renderPaletteList(e.target.value)
  clearTimeout(recallTimer)
  const q = e.target.value.trim()
  if (q.length < 3) {
    palette.recall = null
    return
  }
  recallTimer = setTimeout(async () => {
    try {
      const res = await api(`/api/recall?q=${encodeURIComponent(q)}`)
      if (!palette.open || $('#palette-input').value.trim() !== q) return
      palette.recall = { query: q, ...res }
      renderPaletteList(q)
    } catch {
      /* recall briefly unavailable — the static palette still works */
    }
  }, 180)
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

/* ---------- notification inbox (global, visible from any tab) ---------- */

const notifIconFor = (type) =>
  ({
    'run-succeeded': 'check',
    'run-failed': 'x',
    'run-awaiting-approval': 'clock',
    'check-drift': 'pulse',
    'check-held': 'check',
    escalation: 'shield',
    'manager-message': 'chat',
  })[type] || 'pulse'

let notifState = { items: [], unreadCount: 0 }

function setNotifBadge(count) {
  const badge = $('#notif-badge')
  if (!badge) return
  badge.classList.toggle('hidden', count === 0)
  badge.textContent = count > 99 ? '99+' : String(count)
}

async function refreshNotifications() {
  try {
    const { notifications, unreadCount } = await api('/api/notifications')
    notifState = { items: notifications, unreadCount }
    setNotifBadge(unreadCount)
    if (!$('#notif-panel').classList.contains('hidden')) renderNotifPanel()
  } catch { /* server briefly unavailable */ }
}

function renderNotifPanel() {
  const panel = $('#notif-panel')
  panel.innerHTML = `
    <div class="notif-head">
      Notifications
      <span style="flex:1"></span>
      ${notifState.unreadCount ? `<button class="btn small" id="notif-read-all">Mark all read</button>` : ''}
    </div>
    ${notifState.items.length ? notifState.items.slice(0, 50).map((n) => `
      <div class="notif-item ${n.read ? '' : 'unread'}" data-notif="${n.id}">
        <span class="n-dot"></span>
        <div class="n-body">
          <div class="n-title">${icon(notifIconFor(n.type), 12)}${esc(n.title)}</div>
          ${n.body ? `<div class="n-text">${esc(n.body)}</div>` : ''}
          <div class="n-time">${fmtTime(n.createdAt)}</div>
        </div>
      </div>`).join('') : '<div class="empty">No notifications yet.</div>'}`
  panel.querySelectorAll('[data-notif]').forEach((el) =>
    el.addEventListener('click', () => openNotification(el.dataset.notif))
  )
  $('#notif-read-all')?.addEventListener('click', async (e) => {
    e.stopPropagation()
    await api('/api/notifications/read-all', { method: 'POST' })
    await refreshNotifications()
  })
}

async function openNotification(id) {
  const notif = notifState.items.find((n) => n.id === id)
  if (!notif) return
  if (!notif.read) {
    api(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
    notif.read = true
    notifState.unreadCount = Math.max(0, notifState.unreadCount - 1)
    setNotifBadge(notifState.unreadCount)
  }
  closeNotifPanel()
  if (notif.runId) { state.runId = notif.runId; go('runs') }
  else if (notif.intentId) go('intents')
  else go('chat')
}

function toggleNotifPanel() {
  const panel = $('#notif-panel')
  const opening = panel.classList.contains('hidden')
  panel.classList.toggle('hidden')
  if (opening) renderNotifPanel()
}
function closeNotifPanel() {
  $('#notif-panel').classList.add('hidden')
}
$('#notif-trigger').addEventListener('click', (e) => {
  e.stopPropagation()
  toggleNotifPanel()
})
document.addEventListener('click', (e) => {
  const panel = $('#notif-panel')
  if (panel.classList.contains('hidden')) return
  if (!e.target.closest('#notif-panel') && !e.target.closest('#notif-trigger')) closeNotifPanel()
})

/* ---------- navigation + polling ---------- */

const pages = {
  chat: renderChat,
  home: renderHome,
  repos: renderRepos,
  intents: renderIntents,
  reflexes: renderReflexes,
  routines: renderRoutines,
  runs: renderRuns,
  stats: renderStats,
  catalog: renderCatalog,
  settings: renderSettings,
}

const NAV = [
  { page: 'chat', label: 'Chat', iconName: 'chat' },
  { page: 'home', label: 'Home', iconName: 'home' },
  { page: 'repos', label: 'Repositories', iconName: 'repo' },
  { page: 'intents', label: 'Checks', iconName: 'pulse' },
  { page: 'reflexes', label: 'Reflexes', iconName: 'shield' },
  { page: 'routines', label: 'Routines', iconName: 'sync' },
  { page: 'runs', label: 'Runs', iconName: 'terminal' },
  { page: 'stats', label: 'Stats', iconName: 'graph' },
  { page: 'catalog', label: 'Catalog', iconName: 'plus' },
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

function openRepo(path) {
  state.repoFocus = path
  go('repos')
}

function render() {
  pages[state.page]().catch((err) => {
    main.innerHTML = `<div class="page"><div class="empty">Error: ${esc(err.message)}</div></div>`
  })
}

$('#brand').addEventListener('click', () => go('chat'))

let sidebarRepos = []
async function refreshSidebarRepos() {
  try {
    const [repos, runs] = await Promise.all([api('/api/projects'), api('/api/runs')])
    const running = runs.filter((r) => r.status === 'running').length
    $('#running-indicator').classList.toggle('hidden', running === 0)
    $('#running-count').textContent = running
    sidebarRepos = repos.filter((r) => r.exists).slice(0, 8)
    $('#nav-repos').innerHTML = sidebarRepos.map((r) => `
      <button data-repo="${esc(r.path)}" class="${state.page === 'repos' && state.repoFocus === r.path ? 'active' : ''}">
        ${icon('repo', 14)}<span class="nav-label">${esc(repoName(r.path))}</span>
        ${r.isActive ? '<span class="dot green pulse" style="margin-left:auto"></span>' : ''}
      </button>`).join('')
    $('#nav-repos').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => openRepo(b.dataset.repo))
    )
  } catch { /* server briefly unavailable */ }
}

renderNav()
render()
refreshSidebarRepos()
refreshNotifications()
setInterval(() => {
  refreshSidebarRepos()
  refreshNotifications()
  if (!$('#modal-backdrop').classList.contains('hidden') || palette.open) return
  if (userIsTyping()) return
  if (state.page === 'home') renderHome().catch(() => {})
}, 6000)
