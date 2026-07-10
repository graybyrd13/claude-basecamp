import { spawn } from 'node:child_process'
import { getSettings } from './settings.js'
import { lastPathSegment } from './paths.js'
import { recordNotification } from './notifications.js'

const FETCH_TIMEOUT_MS = 8000

/** Quote a string as a single-quoted PowerShell literal (doubling embedded quotes). */
function psQuote(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

/**
 * Fan a notification out to every configured channel. Fire-and-forget:
 * failures are collected and returned but never thrown, so a dead webhook
 * can't break a run.
 */
export async function sendNotification(stores, { title, body, type = null, projectPath = null, runId = null, intentId = null }) {
  const settings = getSettings(stores)
  const text = body ? `${title}\n${body}` : title
  const attempts = []

  // Additive: the in-app inbox persists alongside outward channels whenever a
  // caller identifies what kind of event this is. Callers that don't (e.g.
  // the Settings page's "send test notification") intentionally skip it.
  if (type) recordNotification(stores, { type, projectPath, title, body, runId, intentId })

  if (settings.slackWebhook) {
    attempts.push(
      post(settings.slackWebhook, { text }).then(
        (r) => ({ channel: 'slack', ok: r.ok }),
        (e) => ({ channel: 'slack', ok: false, error: e.message })
      )
    )
  }
  if (settings.discordWebhook) {
    attempts.push(
      post(settings.discordWebhook, { content: text.slice(0, 1900) }).then(
        (r) => ({ channel: 'discord', ok: r.ok }),
        (e) => ({ channel: 'discord', ok: false, error: e.message })
      )
    )
  }
  if (settings.telegramBotToken && settings.telegramChatId) {
    attempts.push(
      post(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        chat_id: settings.telegramChatId,
        text: text.slice(0, 4000),
      }).then(
        (r) => ({ channel: 'telegram', ok: r.ok }),
        (e) => ({ channel: 'telegram', ok: false, error: e.message })
      )
    )
  }
  if (settings.macosNotifications && process.platform === 'darwin') {
    attempts.push(
      new Promise((resolve) => {
        const script = `display notification ${JSON.stringify(body || '')} with title ${JSON.stringify(`Basecamp: ${title}`)}`
        const child = spawn('osascript', ['-e', script], { stdio: 'ignore' })
        child.on('exit', (code) => resolve({ channel: 'macos', ok: code === 0 }))
        child.on('error', (e) => resolve({ channel: 'macos', ok: false, error: e.message }))
      })
    )
  }
  if (settings.macosNotifications && process.platform === 'win32') {
    attempts.push(
      new Promise((resolve) => {
        // No extra Windows dependency (BurntToast etc.) is available in a
        // zero-dependency tool, so use the .NET NotifyIcon balloon tip that
        // ships with every Windows install instead of true WinRT toasts,
        // which need a registered AppUserModelID to display reliably from an
        // unpackaged script.
        const script = [
          'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
          '$n = New-Object System.Windows.Forms.NotifyIcon',
          '$n.Icon = [System.Drawing.SystemIcons]::Information',
          '$n.Visible = $true',
          `$n.BalloonTipTitle = ${psQuote(`Basecamp: ${title}`)}`,
          `$n.BalloonTipText = ${psQuote(body || '')}`,
          '$n.ShowBalloonTip(8000)',
          'Start-Sleep -Seconds 1',
          '$n.Dispose()',
        ].join('; ')
        const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
          stdio: 'ignore',
          windowsHide: true,
        })
        child.on('exit', (code) => resolve({ channel: 'windows', ok: code === 0 }))
        child.on('error', (e) => resolve({ channel: 'windows', ok: false, error: e.message }))
      })
    )
  }

  return Promise.all(attempts)
}

/** Notify about a finished run, respecting the notify-on-success setting. */
export function notifyRunFinished(stores, run) {
  if (!run) return
  const settings = getSettings(stores)
  if (run.status === 'succeeded' && !settings.notifyOnSuccess) return
  const label = run.routineName ? `Routine "${run.routineName}"` : 'Task'
  const repo = lastPathSegment(run.projectPath)
  const verb = run.status === 'succeeded' ? 'finished' : run.status === 'denied' ? 'was denied' : 'failed'
  sendNotification(stores, {
    title: `${label} ${verb} in ${repo}`,
    body: (run.resultText || run.error || '').slice(0, 300),
  }).catch(() => {})
}
